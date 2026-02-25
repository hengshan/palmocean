FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (psycopg2, geoalchemy2 need libpq + gdal headers)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    gdal-bin \
    libgdal-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml uv.lock ./

# Install dependencies via uv sync (respects lockfile)
RUN uv sync --system --no-cache --no-dev

# Copy app source
COPY . .

# Create storage dirs
RUN mkdir -p storage/uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
