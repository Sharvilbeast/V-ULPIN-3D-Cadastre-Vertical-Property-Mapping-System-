# V-ULPIN · 3D Vertical Property Mapping

Interactive 3D cadastre prototype for the SIH26011 Pune Ward 8 pilot. It includes a Cesium digital twin, V-ULPIN generation, unit inspection, topology audits, and a seeded two-tower inventory.

## Run the Demo

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Cesium runtime assets are copied to `public/cesium` by the install hook. The web app's built-in demo API works without a database or GIS server.

The pilot contains Tower A (G+10, two basements) and Tower B (G+6, one basement), with residential, commercial, parking, and utility spaces. Demo owner labels and RERA links are simulated.

## FastAPI Service

Use Python 3.11 or newer:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m backend.setup_demo
uvicorn backend.main:app --reload --port 8000
```

To route the dashboard to FastAPI instead of the built-in Next demo API, set `NEXT_PUBLIC_VULPIN_API_URL=http://localhost:8000` before starting Next.js. The FastAPI service runs in memory if `DATABASE_URL` is unset.

## PostGIS Mode

Set `DATABASE_URL` to an async PostgreSQL URL, for example:

```text
postgresql+asyncpg://vulpin:change-me@localhost:5432/vulpin
```

The database must have PostGIS and SFCGAL installed. Startup enables `postgis` and `postgis_sfcgal`; `python -m backend.setup_demo` creates the schema and inserts the seed inventory. 3D topology work uses projected metric EPSG:32643 coordinates. The demo vertical heights are synthetic and are not a surveyed geodetic control network.

## Prototype Boundaries

- The standalone Next API uses axis-aligned simulated footprints for fast offline demos. Use FastAPI/PostGIS for projected geometry and SFCGAL volume checks against production survey inputs.
- RERA/carpet-area and ownership fields are illustrative only. No generated record is a government-issued ULPIN, title document, or legal land certificate.
- The “Land certificate” action opens the browser print dialog for a clearly labeled preview; it does not issue a registered certificate.
- Do not put owner PII or deed documents into public 3D Tiles metadata.

See [backend/requirements.txt](backend/requirements.txt) for the API runtime dependencies.
