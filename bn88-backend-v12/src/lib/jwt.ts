// src/lib/jwt.ts
import jwt, { type JwtPayload, type SignOptions, type Secret } from "jsonwebtoken";
import { config } from "../config";

export const getJwtSecret = (): Secret => config.JWT_SECRET;

export const signJwt = (payload: any, options?: SignOptions): string => {
  return jwt.sign(payload, getJwtSecret(), options);
};

export const verifyJwt = <T extends object = JwtPayload>(token: string): T => {
  return jwt.verify(token, getJwtSecret()) as unknown as T;
};


