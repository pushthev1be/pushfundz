
interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
