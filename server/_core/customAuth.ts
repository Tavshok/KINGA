/**
 * Custom Authentication Module
 * 
 * Provides traditional email/password authentication alongside Manus OAuth.
 * This allows external users (claimants, panel beaters, assessors) to register
 * with email/password while admin users continue using Manus OAuth.
 */

import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

/**
 * Hash a plain text password using bcrypt
 * @param password - Plain text password
 * @returns Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a plain text password against a hashed password
 * @param password - Plain text password
 * @param hash - Hashed password from database
 * @returns True if password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token for email verification or password reset
 * @returns Random token string
 */
export function generateToken(): string {
  return nanoid(64);
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Object with isValid flag and error message if invalid
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (password.length < 8) {
    return { isValid: false, error: "Password must be at least 8 characters long" };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { isValid: false, error: "Password must contain at least one uppercase letter" };
  }
  
  if (!/[a-z]/.test(password)) {
    return { isValid: false, error: "Password must contain at least one lowercase letter" };
  }
  
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: "Password must contain at least one number" };
  }
  
  return { isValid: true };
}

/**
 * Validate email format
 * @param email - Email to validate
 * @returns True if valid email format, false otherwise
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate session token for authenticated users
 * @returns Session token
 */
export function generateSessionToken(): string {
  return nanoid(32);
}

/**
 * Calculate token expiration time
 * @param hours - Number of hours until expiration
 * @returns Date object representing expiration time
 */
export function getTokenExpiration(hours: number): Date {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + hours);
  return expiration;
}
