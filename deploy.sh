#!/bin/bash


set -e

echo "🚀 Deploying PushFundz to Production..."

if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found. Please create it from .env.production.example"
    exit 1
fi

export $(cat .env.production | grep -v '^#' | xargs)

required_vars=("DB_PASSWORD" "SECRET_KEY" "GRAFANA_PASSWORD" "ADMIN_EMAIL")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Required environment variable $var is not set"
        exit 1
    fi
done

echo "✅ Environment variables validated"

mkdir -p logs backups ssl monitoring/grafana/dashboards monitoring/grafana/datasources

echo "📦 Pulling latest Docker images..."
docker-compose -f docker-compose.production.yml pull

echo "🔨 Building custom images..."
docker-compose -f docker-compose.production.yml build

echo "🗄️ Running database migrations..."
docker-compose -f docker-compose.production.yml run --rm api python -c "from app.database import create_tables; create_tables()"

echo "🚀 Starting services..."
docker-compose -f docker-compose.production.yml up -d

echo "⏳ Waiting for services to be healthy..."
sleep 30

echo "🔍 Checking service health..."
docker-compose -f docker-compose.production.yml ps

if [ ! -f "ssl/live/$DOMAIN/fullchain.pem" ]; then
    echo "🔒 Setting up SSL certificates..."
    docker-compose -f docker-compose.production.yml run --rm certbot
    
    docker-compose -f docker-compose.production.yml restart nginx
fi

echo "✅ Deployment complete!"
echo ""
echo "🌐 Your application should be available at:"
echo "   Frontend: https://$DOMAIN"
echo "   API: https://$API_DOMAIN"
echo "   Monitoring: http://$DOMAIN:3001 (Grafana)"
echo ""
echo "📊 To view logs:"
echo "   docker-compose -f docker-compose.production.yml logs -f"
echo ""
echo "🔧 To update the application:"
echo "   git pull && ./deploy.sh"
