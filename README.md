![logo_ironhack_blue 7](https://user-images.githubusercontent.com/23629340/40541063-a07a0a8a-601a-11e8-91b5-2f13e4e6b441.png)

# Lab | n8n y Webhooks — Automatizar la API de Películas

### Requisitos

* Haz un fork de este repositorio
* Clona este repositorio

### Entrega

* Al finalizar, ejecuta los siguientes comandos:

```
git add .
git commit -m "done"
git push origin [master/main]
```

* Crea un Pull Request y envía tu entrega.

## Objetivo

Crear un endpoint webhook en tu API Express que reciba datos de un flujo de n8n, y los guarde en PostgreSQL. Construirás también el flujo completo en n8n que envía datos a tu API.

## Requisitos previos

- Haber completado el Lab D4 (API con PostgreSQL)
- n8n instalado globalmente (`npm install -g n8n`) o via Docker
- Haber leído el material del D5
- Postman o Thunder Client

## Lo que vas a construir

```
[Formulario / curl]
       │
       ▼
[n8n Webhook Trigger]
       │
       ▼
[n8n Code Node] ← Valida y formatea los datos
       │
       ▼
[n8n HTTP Request] → POST /webhooks/peliculas → [Tu Express]
                                                      │
                                                      ├── Verifica firma HMAC
                                                      ├── Guarda en PostgreSQL
                                                      └── Responde { ok: true }
```

## Parte 1: El Endpoint Webhook en Express

### Paso 1: Crear la tabla para registrar eventos de webhook

En psql:

```sql
\c peliculas_db

CREATE TABLE webhook_eventos (
  id          SERIAL PRIMARY KEY,
  event_id    VARCHAR(100) UNIQUE NOT NULL,
  tipo        VARCHAR(50) NOT NULL,
  payload     JSONB NOT NULL,
  procesado   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

Esta tabla sirve para implementar **idempotencia**: si n8n reenvía el mismo evento (por un reintento), no procesamos los datos dos veces.

### Paso 2: Añadir el secreto al .env

```
WEBHOOK_SECRET=mi-secreto-super-seguro-2024
```

### Paso 3: Crear el middleware de verificación de firma

Crea `src/middleware/verificarWebhook.js`:

```javascript
// src/middleware/verificarWebhook.js
const crypto = require('crypto')

const verificarWebhook = (req, res, next) => {
  const firma = req.headers['x-webhook-signature']

  if (!firma) {
    return res.status(401).json({ error: 'Falta la firma del webhook' })
  }

  const secreto = process.env.WEBHOOK_SECRET

  // Calculamos la firma esperada con el body de la petición
  const firmaEsperada = 'sha256=' + crypto
    .createHmac('sha256', secreto)
    .update(JSON.stringify(req.body))
    .digest('hex')

  // timingSafeEqual evita ataques de timing (nunca uses === para comparar firmas)
  try {
    const firmaBuffer = Buffer.from(firma, 'utf8')
    const firmaEsperadaBuffer = Buffer.from(firmaEsperada, 'utf8')

    if (firmaBuffer.length !== firmaEsperadaBuffer.length ||
        !crypto.timingSafeEqual(firmaBuffer, firmaEsperadaBuffer)) {
      return res.status(401).json({ error: 'Firma de webhook inválida' })
    }
  } catch (e) {
    return res.status(401).json({ error: 'Error al verificar firma' })
  }

  next()
}

module.exports = verificarWebhook
```

### Paso 4: Crear el router de webhooks

Crea `src/routes/webhooks.js`:

```javascript
// src/routes/webhooks.js
const { Router } = require('express')
const router = Router()
const pool = require('../config/db')
const verificarWebhook = require('../middleware/verificarWebhook')
const AppError = require('../utils/AppError')

// POST /webhooks/peliculas
// Recibe una nueva película desde n8n y la guarda en la base de datos
router.post('/peliculas', verificarWebhook, async (req, res, next) => {
  try {
    const { event_id, titulo, anio, nota, director, genero } = req.body

    // Validación básica
    if (!event_id || !titulo || !anio) {
      throw new AppError('Faltan campos obligatorios: event_id, titulo, anio', 400)
    }

    // Idempotencia: comprobar si este evento ya fue procesado
    const eventoExistente = await pool.query(
      'SELECT id FROM webhook_eventos WHERE event_id = $1',
      [event_id]
    )

    if (eventoExistente.rows.length > 0) {
      return res.json({ ok: true, mensaje: 'Evento ya procesado anteriormente' })
    }

    // Usar una transacción para guardar el evento y la película juntos
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // 1. Registrar el evento en webhook_eventos
      await client.query(
        `INSERT INTO webhook_eventos (event_id, tipo, payload)
         VALUES ($1, 'nueva_pelicula', $2)`,
        [event_id, JSON.stringify(req.body)]
      )

      // 2. Buscar o crear el director si se proporcionó
      let directorId = null
      if (director) {
        const directorResult = await client.query(
          `INSERT INTO directores (nombre)
           VALUES ($1)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [director]
        )

        if (directorResult.rows.length > 0) {
          directorId = directorResult.rows[0].id
        } else {
          const existente = await client.query(
            'SELECT id FROM directores WHERE nombre = $1',
            [director]
          )
          directorId = existente.rows[0]?.id || null
        }
      }

      // 3. Buscar el género si se proporcionó
      let generoId = null
      if (genero) {
        const generoResult = await client.query(
          'SELECT id FROM generos WHERE slug = $1 OR nombre ILIKE $2',
          [genero.toLowerCase(), genero]
        )
        generoId = generoResult.rows[0]?.id || null
      }

      // 4. Insertar la película
      const peliculaResult = await client.query(
        `INSERT INTO peliculas (titulo, anio, nota, director_id, genero_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [titulo, Number(anio), nota ? Number(nota) : null, directorId, generoId]
      )

      // 5. Marcar el evento como procesado
      await client.query(
        'UPDATE webhook_eventos SET procesado = true WHERE event_id = $1',
        [event_id]
      )

      await client.query('COMMIT')

      res.status(201).json({
        ok: true,
        pelicula: peliculaResult.rows[0]
      })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

  } catch (err) {
    next(err)
  }
})

// POST /webhooks/resenas
// Recibe una nueva reseña desde n8n
router.post('/resenas', verificarWebhook, async (req, res, next) => {
  try {
    const { event_id, pelicula_id, autor, texto, puntuacion } = req.body

    if (!event_id || !pelicula_id || !autor || !texto || !puntuacion) {
      throw new AppError('Faltan campos: event_id, pelicula_id, autor, texto, puntuacion', 400)
    }

    // Idempotencia
    const existe = await pool.query(
      'SELECT id FROM webhook_eventos WHERE event_id = $1',
      [event_id]
    )
    if (existe.rows.length > 0) {
      return res.json({ ok: true, mensaje: 'Evento ya procesado' })
    }

    // Verificar que la película existe
    const pelicula = await pool.query('SELECT id FROM peliculas WHERE id = $1', [pelicula_id])
    if (pelicula.rows.length === 0) {
      throw new AppError('Película no encontrada', 404)
    }

    // Guardar evento y reseña
    await pool.query(
      `INSERT INTO webhook_eventos (event_id, tipo, payload, procesado)
       VALUES ($1, 'nueva_resena', $2, true)`,
      [event_id, JSON.stringify(req.body)]
    )

    const { rows } = await pool.query(
      `INSERT INTO resenas (pelicula_id, autor, texto, puntuacion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [pelicula_id, autor, texto, Number(puntuacion)]
    )

    res.status(201).json({ ok: true, resena: rows[0] })

  } catch (err) {
    next(err)
  }
})

module.exports = router
```

### Paso 5: Montar el router de webhooks en index.js

```javascript
// En index.js, añade junto a las demás rutas:
const webhooksRouter = require('./src/routes/webhooks')

// ...después de app.use(express.json())...
app.use('/webhooks', webhooksRouter)
```

### Paso 6: Probar el webhook manualmente con curl

Antes de configurar n8n, prueba el endpoint directamente calculando la firma:

```bash
# Guarda este script como test-webhook.sh
BODY='{"event_id":"test-001","titulo":"Avatar","anio":2009,"nota":7.9,"director":"James Cameron","genero":"ciencia-ficcion"}'
SECRET="mi-secreto-super-seguro-2024"
FIRMA="sha256=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')"

curl -X POST http://localhost:3000/webhooks/peliculas \
  -H "Content-Type: application/json" \
  -H "x-webhook-signature: $FIRMA" \
  -d "$BODY"
```

Respuesta esperada:
```json
{ "ok": true, "pelicula": { "id": 8, "titulo": "Avatar", ... } }
```

Prueba también sin firma:
```bash
curl -X POST http://localhost:3000/webhooks/peliculas \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Test"}'
```
→ Debe devolver 401.

Envía el mismo evento dos veces (mismo `event_id`):
```bash
# Segunda vez con el mismo event_id "test-001"
# Debe responder: { "ok": true, "mensaje": "Evento ya procesado anteriormente" }
```

## Parte 2: El Flujo en n8n

### Paso 7: Iniciar n8n

```bash
n8n start
```

Abre `http://localhost:5678` en el navegador. Si es la primera vez, crea una cuenta (solo local).

### Paso 8: Crear el workflow

Haz clic en **"New Workflow"** y nombra el workflow `"Registrar Película"`.

#### Nodo 1: Webhook Trigger

1. Haz clic en el `+` y busca **"Webhook"**
2. Configura:
   - **HTTP Method**: POST
   - **Path**: `registrar-pelicula`
   - **Response Mode**: `Respond to Webhook`
3. Copia la URL de producción que aparece: `http://localhost:5678/webhook/registrar-pelicula`

#### Nodo 2: Code — Validar y preparar datos

Conecta al Webhook y añade un nodo **"Code"**:

```javascript
// En el nodo Code de n8n
const items = $input.all()

return items.map(item => {
  const { titulo, anio, nota, director, genero } = item.json

  // Validación
  if (!titulo || !anio) {
    throw new Error('titulo y anio son obligatorios')
  }

  // Generar un event_id único basado en titulo + anio
  const eventId = `pelicula-${titulo.toLowerCase().replace(/\s+/g, '-')}-${anio}`

  return {
    json: {
      event_id: eventId,
      titulo: titulo.trim(),
      anio: parseInt(anio),
      nota: nota ? parseFloat(nota) : null,
      director: director ? director.trim() : null,
      genero: genero ? genero.toLowerCase().replace(/\s+/, '-') : null
    }
  }
})
```

#### Nodo 3: Code — Calcular firma HMAC

Añade otro nodo **"Code"** para calcular la firma:

```javascript
const crypto = require('crypto')
const items = $input.all()

const SECRET = 'mi-secreto-super-seguro-2024'

return items.map(item => {
  const body = JSON.stringify(item.json)
  const firma = 'sha256=' + crypto
    .createHmac('sha256', SECRET)
    .update(body)
    .digest('hex')

  return {
    json: {
      ...item.json,
      _firma: firma,
      _body: body
    }
  }
})
```

> **Nota de seguridad**: En un entorno real nunca pondríamos el secreto en el código de n8n. Usaríamos las credenciales de n8n o variables de entorno.

#### Nodo 4: HTTP Request — Llamar a tu API

Añade un nodo **"HTTP Request"**:

- **Method**: POST
- **URL**: `http://localhost:3000/webhooks/peliculas`
- **Send Headers**: Activar
  - Header: `Content-Type` → `application/json`
  - Header: `x-webhook-signature` → `{{ $json._firma }}`
- **Send Body**: Activar → **Body Content Type**: JSON
- **Body Parameters**: Usar **JSON/RAW** y poner:
  ```
  {{ JSON.stringify($json) }}
  ```

#### Nodo 5: IF — Verificar resultado

Añade un nodo **"IF"**:
- **Condition**: `{{ $json.ok }}` **equals** `true`

Conecta la rama **True** a un nodo **"Respond to Webhook"** con:
```json
{ "exito": true, "mensaje": "Película registrada correctamente" }
```

Conecta la rama **False** a otro **"Respond to Webhook"** con:
```json
{ "exito": false, "mensaje": "Error al registrar la película" }
```

### Paso 9: Activar y probar el workflow

1. Activa el workflow con el toggle de arriba a la derecha
2. Prueba enviando datos al webhook de n8n:

```bash
curl -X POST http://localhost:5678/webhook/registrar-pelicula \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Oppenheimer",
    "anio": 2023,
    "nota": 8.5,
    "director": "Christopher Nolan",
    "genero": "drama"
  }'
```

Respuesta esperada:
```json
{ "exito": true, "mensaje": "Película registrada correctamente" }
```

Verifica en PostgreSQL:
```sql
SELECT * FROM peliculas ORDER BY id DESC LIMIT 1;
SELECT * FROM webhook_eventos ORDER BY id DESC LIMIT 1;
```

### Paso 10: Probar la idempotencia

Envía el mismo curl exactamente igual (mismo título y año → mismo `event_id`). n8n procesará la petición, llamará a tu API, pero esta vez tu API detectará el `event_id` duplicado y responderá con `"Evento ya procesado anteriormente"`. La película no se duplicará en la base de datos.

## Parte 3: Reflexión y análisis

Responde estas preguntas (pueden ser en un archivo `NOTAS.md` o comentadas en el código):

1. **¿Por qué usamos `timingSafeEqual` en lugar de `===` para comparar las firmas?**

2. **¿Qué ocurriría si n8n intenta enviar el mismo evento 3 veces porque el servidor tardó en responder?** ¿Cómo lo resuelve tu implementación?

3. **¿Qué ventaja tiene usar una transacción en el endpoint de `nueva_pelicula`?** ¿Qué pasaría si insertamos el evento pero falla la inserción de la película?

## Criterios de evaluación

- [ ] `POST /webhooks/peliculas` sin cabecera `x-webhook-signature` devuelve 401
- [ ] `POST /webhooks/peliculas` con firma incorrecta devuelve 401
- [ ] `POST /webhooks/peliculas` con firma correcta guarda la película en PostgreSQL
- [ ] El mismo `event_id` enviado dos veces no duplica la película en la DB
- [ ] La transacción hace ROLLBACK si falla cualquier operación
- [ ] El flujo de n8n recibe datos, calcula la firma, llama a la API y devuelve respuesta
- [ ] `GET /api/peliculas` muestra las películas añadidas vía webhook

## Bonus

1. **Limpiar el body antes de enviarlo**: En el nodo Code de firma, elimina `_firma` y `_body` antes de pasarlos al nodo HTTP Request (usa desestructuración: `const { _firma, _body, ...datosLimpios } = item.json`).
2. **Webhook para reseñas**: Crea un segundo workflow en n8n `"Registrar Reseña"` que envíe datos a `POST /webhooks/resenas`. Pruébalo.
3. **Endpoint de auditoría**: Crea `GET /api/admin/webhooks` que devuelva todos los registros de `webhook_eventos` con paginación. Úsalo para auditar qué eventos han llegado.
4. **ngrok**: Si quieres que un servicio externo real (como un formulario de Google Forms o Typeform) pueda enviar datos a tu API local, expón tu servidor con `ngrok http 3000` y configura el webhook con la URL pública que te dé ngrok.