// src/controllers/peliculasController.js
const peliculaService = require('../services/PeliculaService')

const listarPeliculas = async (req, res, next) => {
  try {
    const { genero, buscar } = req.query
    const peliculas = await peliculaService.obtenerTodas({ genero, buscar })
    res.json(peliculas)
  } catch (err) {
    next(err)
  }
}

const obtenerPelicula = async (req, res, next) => {
  try {
    const pelicula = await peliculaService.obtenerPorId(Number(req.params.id))
    res.json(pelicula)
  } catch (err) {
    next(err)
  }
}

const crearPelicula = async (req, res, next) => {
  try {
    const nueva = await peliculaService.crear(req.body)
    res.status(201).json(nueva)
  } catch (err) {
    next(err)
  }
}

const actualizarPelicula = async (req, res, next) => {
  try {
    const actualizada = await peliculaService.actualizar(Number(req.params.id), req.body)
    res.json(actualizada)
  } catch (err) {
    next(err)
  }
}

const eliminarPelicula = async (req, res, next) => {
  try {
    const eliminada = await peliculaService.eliminar(Number(req.params.id))
    res.json({ mensaje: 'Película eliminada', pelicula: eliminada })
  } catch (err) {
    next(err)
  }
}

const obtenerEstadisticas = async (req, res, next) => {
  try {
    const stats = await peliculaService.obtenerEstadisticas()
    res.json(stats)
  } catch (err) {
    next(err)
  }
}

const listarResenas = async (req, res, next) => {
  try {
    const resenas = await peliculaService.obtenerResenas(Number(req.params.id))
    res.json(resenas)
  } catch (err) {
    next(err)
  }
}

const crearResena = async (req, res, next) => {
  try {
    const nueva = await peliculaService.crearResena(Number(req.params.id), req.body)
    res.status(201).json(nueva)
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listarPeliculas,
  obtenerPelicula,
  crearPelicula,
  actualizarPelicula,
  eliminarPelicula,
  obtenerEstadisticas,
  listarResenas,
  crearResena
}