Pregunta 1: ¿Por qué usamos timingSafeEqual en lugar de ===?
Con === el ordenador para de comparar en cuanto encuentra una diferencia, lo que permite a un atacante medir los tiempos de respuesta para adivinar la firma poco a poco. timingSafeEqual siempre tarda lo mismo independientemente de cuántos caracteres coincidan, eliminando esa pista.

Pregunta 2: ¿Qué ocurre si n8n envía el mismo evento 3 veces?
La primera vez se procesa correctamente y se guarda el event_id en la tabla webhook_eventos. La segunda y tercera vez, antes de hacer nada, el código busca ese event_id en la tabla y como ya existe, devuelve "Evento ya procesado anteriormente" sin insertar nada. La película no se duplica en la base de datos.

Pregunta 3: ¿Qué ventaja tiene usar una transacción?
La transacción agrupa varias operaciones (guardar el evento, el director, la película) en un bloque que o se ejecuta todo o no se ejecuta nada. Si por ejemplo se guarda el evento pero falla la inserción de la película, el ROLLBACK deshace todo y la base de datos queda limpia, sin datos a medias ni inconsistencias.