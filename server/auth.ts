import crypto from 'crypto';
import type { IncomingMessage } from 'http';
import type { NextFunction, Request, Response } from 'express';
import { sanitizeUser, store } from './store.ts';
import type { Tenant, User, UserRole } from '../src/types/domain.ts';

const SESSION_COOKIE_NAME = 'nivas_session';
const SIGNED_OUT_COOKIE_NAME = 'nivas_signed_out';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SECRET;
}

export interface SessionContext {
  user: User;
  tenant: Tenant;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      sessionCtx?: SessionContext;
    }
  }
}

interface SessionPayload {
  uid: string;
  tid: string;
  exp: number;
}

function isHttpsRequest(req: Request): boolean {
  const xfProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || xfProto.includes('https');
}

function formatCookieHeader(
  name: string,
  value: string,
  maxAgeSeconds: number,
  https: boolean
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    https ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    parts.push('Secure', 'Partitioned');
  }
  return parts.join('; ');
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
}

export function createSessionToken(userId: string, tenantId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    tid: tenantId,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as SessionPayload;
    if (!parsed.uid || !parsed.tid || typeof parsed.exp !== 'number') return null;
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  userId: string,
  tenantId: string
): string {
  const token = createSessionToken(userId, tenantId);
  const https = isHttpsRequest(req);
  res.append(
    'Set-Cookie',
    formatCookieHeader(
      SESSION_COOKIE_NAME,
      token,
      Math.floor(SESSION_TTL_MS / 1000),
      https
    )
  );
  return token;
}

export function clearSessionCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  res.append('Set-Cookie', formatCookieHeader(SESSION_COOKIE_NAME, '', 0, https));
}

export function setSignedOutCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  res.append(
    'Set-Cookie',
    formatCookieHeader(SIGNED_OUT_COOKIE_NAME, '1', 24 * 60 * 60, https)
  );
}

export function clearSignedOutCookie(req: Request, res: Response) {
  const https = isHttpsRequest(req);
  res.append('Set-Cookie', formatCookieHeader(SIGNED_OUT_COOKIE_NAME, '', 0, https));
}

export function resolveSessionFromTokenAndHeaders(
  bearerToken?: string,
  cookieHeader?: string
): SessionContext | null {
  const cookies = parseCookies(cookieHeader);
  const token = bearerToken || cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const db = store.getRawState();
  const storedUser = db.users.find(
    (u) => u.id === payload.uid && u.isActive !== false
  );
  const tenant = db.tenants.find((t) => t.id === payload.tid);
  if (!storedUser || !tenant) return null;

  if (storedUser.role === 'overall_admin') {
    // Overall Admin may switch across any workspace (including suspended ones to manage them)
  } else if (storedUser.role === 'owner') {
    const ownsWorkspace =
      storedUser.tenantId === tenant.id || tenant.ownerId === storedUser.id;
    if (!ownsWorkspace || tenant.status === 'suspended') {
      return null;
    }
  } else {
    if (storedUser.tenantId !== tenant.id || tenant.status === 'suspended') {
      return null;
    }
  }

  return { user: sanitizeUser(storedUser), tenant, token };
}

export function resolveSessionFromRequest(req: Request): SessionContext | null {
  const authHeader = String(req.headers.authorization || '');
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  return resolveSessionFromTokenAndHeaders(bearerToken, req.headers.cookie);
}

export function resolveSessionFromIncomingMessage(
  req: IncomingMessage,
  queryToken?: string
): SessionContext | null {
  const authHeader = String(req.headers.authorization || '');
  const bearerToken =
    queryToken?.trim() ||
    (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');
  return resolveSessionFromTokenAndHeaders(bearerToken, req.headers.cookie);
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const ctx = resolveSessionFromRequest(req);
  if (!ctx) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  req.sessionCtx = ctx;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ctx = req.sessionCtx;
    if (!ctx) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    if (!allowedRoles.includes(ctx.user.role)) {
      res.status(403).json({
        error: `Permission denied for role "${ctx.user.role}". Required: ${allowedRoles.join(' or ')}.`,
      });
      return;
    }
    next();
  };
}

// Sliding-window in-memory rate limiter for auth & outbound verification/reminder routes
const rateBuckets = new Map<string, number[]>();

export function createRateLimiter(options: {
  keyPrefix: string;
  windowMs: number;
  maxRequests: number;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const tenantPart = req.sessionCtx?.tenant.id || 'anon';
    const bucketKey = `${options.keyPrefix}:${tenantPart}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const recent = (rateBuckets.get(bucketKey) || []).filter((ts) => ts > cutoff);

    if (recent.length >= options.maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }

    recent.push(now);
    rateBuckets.set(bucketKey, recent);
    next();
  };
}
