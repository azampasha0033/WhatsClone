import jwt from 'jsonwebtoken';

export function jwtAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing Bearer token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'changeme');
    req.user = payload; // { _id, email, clientId?, role? }
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid/expired token' });
  }
}
