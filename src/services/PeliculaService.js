const pool = require('../config/db')
const AppError = require('../utils/AppError')

class PeliculaService {

  async obtenerTodas(filtros = {}) {
    let query = `
      SELECT
        p.id,
        p.titulo,
        p.anio,
        p.nota,
        d.nombre AS director,
        g.nombre AS genero,
        g.slug   AS genero_slug
      FROM peliculas p
      LEFT JOIN directores d ON p.director_id = d.id
      LEFT JOIN generos g ON p.genero_id = g.id
    `
    const params = []

    if (filtros.genero) {
      params.push(filtros.genero)
      query += ` WHERE g.slug = $${params.length}`
    }

    if (filtros.buscar) {
      params.push(`%${filtros.buscar}%`)
      const condicion = `(p.titulo ILIKE $${params.length} OR d.nombre ILIKE $${params.length})`
      query += filtros.genero ? ` AND ${condicion}` : ` WHERE ${condicion}`
    }

    query += ' ORDER BY p.nota DESC NULLS LAST'

    const { rows } = await pool.query(query, params)
    return rows
  }

  async obtenerPorId(id) {
    const { rows } = await pool.query(
      `SELECT
        p.id, p.titulo, p.anio, p.nota,
        d.id AS director_id, d.nombre AS director, d.nacionalidad,
        g.id AS genero_id, g.nombre AS genero
       FROM peliculas p
       LEFT JOIN directores d ON p.director_id = d.id
       LEFT JOIN generos g ON p.genero_id = g.id
       WHERE p.id = $1`,
      [id]
    )

    if (rows.length === 0) throw new AppError('Película no encontrada', 404)
    return rows[0]
  }

  async crear(datos) {
    const { titulo, anio, nota, director_id, genero_id } = datos

    if (nota !== undefined && (nota < 0 || nota > 10)) {
      throw new AppError('La nota debe estar entre 0 y 10', 400)
    }

    const { rows } = await pool.query(
      `INSERT INTO peliculas (titulo, anio, nota, director_id, genero_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [titulo, Number(anio), nota ? Number(nota) : null, director_id || null, genero_id || null]
    )

    return rows[0]
  }

  async actualizar(id, datos) {
    const pelicula = await this.obtenerPorId(id)

    const { titulo, anio, nota, director_id, genero_id } = datos

    const { rows } = await pool.query(
      `UPDATE peliculas
       SET titulo = $1, anio = $2, nota = $3, director_id = $4, genero_id = $5
       WHERE id = $6
       RETURNING *`,
      [
        titulo || pelicula.titulo,
        anio ? Number(anio) : pelicula.anio,
        nota !== undefined ? Number(nota) : pelicula.nota,
        director_id || pelicula.director_id,
        genero_id || pelicula.genero_id,
        id
      ]
    )

    return rows[0]
  }

  async eliminar(id) {
    const { rows } = await pool.query(
      'DELETE FROM peliculas WHERE id = $1 RETURNING *',
      [id]
    )

    if (rows.length === 0) throw new AppError('Película no encontrada', 404)
    return rows[0]
  }

  async obtenerEstadisticas() {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        ROUND(AVG(nota)::numeric, 2) AS media_nota,
        MAX(nota) AS nota_maxima,
        MIN(nota) AS nota_minima
      FROM peliculas
      WHERE nota IS NOT NULL
    `)

    const { rows: porGenero } = await pool.query(`
      SELECT g.nombre AS genero, COUNT(p.id)::int AS cantidad
      FROM generos g
      LEFT JOIN peliculas p ON p.genero_id = g.id
      GROUP BY g.id, g.nombre
      ORDER BY cantidad DESC
    `)

    return { ...rows[0], porGenero }
  }

  async obtenerResenas(peliculaId) {
    await this.obtenerPorId(peliculaId)

    const { rows } = await pool.query(
      'SELECT * FROM resenas WHERE pelicula_id = $1 ORDER BY created_at DESC',
      [peliculaId]
    )

    return rows
  }

  async crearResena(peliculaId, datos) {
    await this.obtenerPorId(peliculaId)

    const { autor, texto, puntuacion } = datos

    if (puntuacion < 1 || puntuacion > 10) {
      throw new AppError('La puntuacion debe ser entre 1 y 10', 400)
    }

    const { rows } = await pool.query(
      `INSERT INTO resenas (pelicula_id, autor, texto, puntuacion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [peliculaId, autor, texto, Number(puntuacion)]
    )

    return rows[0]
  }
}

module.exports = new PeliculaService()