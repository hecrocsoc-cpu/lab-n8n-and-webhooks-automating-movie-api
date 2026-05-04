const crypto = require('crypto')

const verificarWebhook = (req, res, next) => {
  const firma = req.headers['x-webhook-signature']

  if (!firma) {
    return res.status(401).json({ error: 'Falta la firma del webhook' })
  }

  const secreto = process.env.WEBHOOK_SECRET

  const firmaEsperada = 'sha256=' + crypto
    .createHmac('sha256', secreto)
    .update(JSON.stringify(req.body))
    .digest('hex')

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