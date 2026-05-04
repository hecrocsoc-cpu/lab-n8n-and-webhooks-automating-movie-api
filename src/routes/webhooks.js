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