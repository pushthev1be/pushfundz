use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod pushfundz_lending {
    use super::*;

    pub fn initialize_collateral_vault(ctx: Context<InitializeCollateralVault>) -> Result<()> {
        let collateral_vault = &mut ctx.accounts.collateral_vault;
        collateral_vault.authority = ctx.accounts.authority.key();
        collateral_vault.bump = *ctx.bumps.get("collateral_vault").unwrap();
        Ok(())
    }

    pub fn deposit_collateral(
        ctx: Context<DepositCollateral>,
        amount: u64,
        loan_id: u64,
    ) -> Result<()> {
        let collateral_deposit = &mut ctx.accounts.collateral_deposit;
        collateral_deposit.borrower = ctx.accounts.borrower.key();
        collateral_deposit.mint = ctx.accounts.collateral_mint.key();
        collateral_deposit.amount = amount;
        collateral_deposit.loan_id = loan_id;
        collateral_deposit.is_active = true;
        collateral_deposit.deposit_time = Clock::get()?.unix_timestamp;
        collateral_deposit.bump = *ctx.bumps.get("collateral_deposit").unwrap();

        let cpi_accounts = Transfer {
            from: ctx.accounts.borrower_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        Ok(())
    }

    pub fn request_loan(
        ctx: Context<RequestLoan>,
        amount: u64,
        interest_rate: u16,
        duration: i64,
        collateral_deposit_id: u64,
    ) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        loan.borrower = ctx.accounts.borrower.key();
        loan.amount = amount;
        loan.interest_rate = interest_rate;
        loan.duration = duration;
        loan.collateral_deposit_id = collateral_deposit_id;
        loan.status = LoanStatus::Pending;
        loan.created_at = Clock::get()?.unix_timestamp;
        loan.bump = *ctx.bumps.get("loan").unwrap();

        Ok(())
    }

    pub fn approve_loan(ctx: Context<ApproveLoan>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(loan.status == LoanStatus::Pending, ErrorCode::LoanNotPending);
        
        loan.status = LoanStatus::Approved;
        loan.approved_at = Clock::get()?.unix_timestamp;
        loan.due_date = loan.approved_at + loan.duration;

        Ok(())
    }

    pub fn disburse_loan(ctx: Context<DisburseLoan>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(loan.status == LoanStatus::Approved, ErrorCode::LoanNotApproved);

        loan.status = LoanStatus::Active;

        let authority_seeds = &[
            b"loan_vault",
            &[ctx.accounts.loan_vault.bump],
        ];
        let signer = &[&authority_seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.borrower_token_account.to_account_info(),
            authority: ctx.accounts.loan_vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, loan.amount)?;

        Ok(())
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        require!(loan.status == LoanStatus::Active, ErrorCode::LoanNotActive);

        let total_repayment = loan.amount + (loan.amount * loan.interest_rate as u64) / 10000;

        let cpi_accounts = Transfer {
            from: ctx.accounts.borrower_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, total_repayment)?;

        loan.status = LoanStatus::Repaid;
        loan.repaid_at = Clock::get()?.unix_timestamp;

        Ok(())
    }

    pub fn award_points(
        ctx: Context<AwardPoints>,
        amount: u64,
        reason: String,
    ) -> Result<()> {
        let points_account = &mut ctx.accounts.points_account;
        points_account.balance += amount;
        points_account.total_earned += amount;

        points_account.tier = match points_account.total_earned {
            0..=999 => 0,      // Bronze
            1000..=4999 => 1,  // Silver
            5000..=9999 => 2,  // Gold
            _ => 3,            // Platinum
        };

        emit!(PointsAwarded {
            user: ctx.accounts.user.key(),
            amount,
            reason,
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeCollateralVault<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + CollateralVault::INIT_SPACE,
        seeds = [b"collateral_vault"],
        bump
    )]
    pub collateral_vault: Account<'info, CollateralVault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(loan_id: u64)]
pub struct DepositCollateral<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + CollateralDeposit::INIT_SPACE,
        seeds = [b"collateral", borrower.key().as_ref(), &loan_id.to_le_bytes()],
        bump
    )]
    pub collateral_deposit: Account<'info, CollateralDeposit>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub collateral_mint: Account<'info, token::Mint>,
    #[account(mut)]
    pub borrower_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestLoan<'info> {
    #[account(
        init,
        payer = borrower,
        space = 8 + Loan::INIT_SPACE,
        seeds = [b"loan", borrower.key().as_ref()],
        bump
    )]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveLoan<'info> {
    #[account(mut)]
    pub loan: Account<'info, Loan>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct DisburseLoan<'info> {
    #[account(mut)]
    pub loan: Account<'info, Loan>,
    #[account(
        seeds = [b"loan_vault"],
        bump = loan_vault.bump
    )]
    pub loan_vault: Account<'info, LoanVault>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub borrower_token_account: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut)]
    pub loan: Account<'info, Loan>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AwardPoints<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + PointsAccount::INIT_SPACE,
        seeds = [b"points", user.key().as_ref()],
        bump
    )]
    pub points_account: Account<'info, PointsAccount>,
    pub user: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct CollateralVault {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CollateralDeposit {
    pub borrower: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub loan_id: u64,
    pub is_active: bool,
    pub deposit_time: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub borrower: Pubkey,
    pub amount: u64,
    pub interest_rate: u16,
    pub duration: i64,
    pub collateral_deposit_id: u64,
    pub status: LoanStatus,
    pub created_at: i64,
    pub approved_at: i64,
    pub due_date: i64,
    pub repaid_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LoanVault {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PointsAccount {
    pub balance: u64,
    pub total_earned: u64,
    pub total_redeemed: u64,
    pub tier: u8,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum LoanStatus {
    Pending,
    Approved,
    Active,
    Repaid,
    Defaulted,
}

#[event]
pub struct PointsAwarded {
    pub user: Pubkey,
    pub amount: u64,
    pub reason: String,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Loan is not in pending status")]
    LoanNotPending,
    #[msg("Loan is not approved")]
    LoanNotApproved,
    #[msg("Loan is not active")]
    LoanNotActive,
}
