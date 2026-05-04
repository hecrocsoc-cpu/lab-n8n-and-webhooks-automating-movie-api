// src/data/peliculas.js

let peliculas = [
  { id: 1, titulo: 'Inception', director: 'Christopher Nolan', anio: 2010, genero: 'ciencia-ficcion', nota: 8.8 },
  { id: 2, titulo: 'Pulp Fiction', director: 'Quentin Tarantino', anio: 1994, genero: 'crimen', nota: 8.9 },
  { id: 3, titulo: 'El Señor de los Anillos', director: 'Peter Jackson', anio: 2001, genero: 'fantasia', nota: 8.8 }
]

let resenas = [
  { id: 1, pelicula_id: 1, autor: 'María', texto: 'Obra maestra', puntuacion: 9 },
  { id: 2, pelicula_id: 1, autor: 'Carlos', texto: 'Confusa pero brillante', puntuacion: 8 },
  { id: 3, pelicula_id: 2, autor: 'Ana', texto: 'Clásico imprescindible', puntuacion: 10 }
]

let nextPeliculaId = 4
let nextResenaId = 4

const db = {
  getAll: (genero) => {
    if (genero) return peliculas.filter(p => p.genero === genero)
    return peliculas
  },
  getById: (id) => peliculas.find(p => p.id === id) || null,
  create: (datos) => {
    const nueva = { id: nextPeliculaId++, ...datos }
    peliculas.push(nueva)
    return nueva
  },
  update: (id, datos) => {
    const index = peliculas.findIndex(p => p.id === id)
    if (index === -1) return null
    peliculas[index] = { ...peliculas[index], ...datos }
    return peliculas[index]
  },
  delete: (id) => {
    const index = peliculas.findIndex(p => p.id === id)
    if (index === -1) return null
    return peliculas.splice(index, 1)[0]
  },
  getStats: () => {
    const conNota = peliculas.filter(p => p.nota !== null)
    if (conNota.length === 0) return { media: null, total: peliculas.length }
    const media = conNota.reduce((acc, p) => acc + p.nota, 0) / conNota.length
    return { media: Number(media.toFixed(2)), total: peliculas.length }
  },
  getResenas: (peliculaId) => resenas.filter(r => r.pelicula_id === peliculaId),
  createResena: (peliculaId, datos) => {
    const nueva = { id: nextResenaId++, pelicula_id: peliculaId, ...datos }
    resenas.push(nueva)
    return nueva
  }
}

module.exports = db