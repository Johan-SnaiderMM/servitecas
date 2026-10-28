/**
 * Lo mínimo de Supabase que las migraciones dan por existente (roles, auth.users, auth.uid()/auth.jwt()),
 * para correr TODO el SQL del proyecto en un Postgres local (PGlite) sin Docker ni cuenta de Supabase.
 * Lo usan las pruebas (src/test/base-datos.ts) y, más adelante, el modo local de desarrollo (DEMO_BD=local).
 * Módulo puro: sin dependencias de Next ni del servidor.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const SUPABASE_MINIMO = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema if not exists extensions; create schema auth;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  -- Storage (lo mínimo para que corra la migración de políticas de archivos).
  create schema storage;
  grant usage on schema storage to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;
  -- storage.foldername('a/b/c.jpg') = {a,b}: las carpetas, sin el archivo.
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  -- Supabase da acceso total por defecto sobre lo nuevo en public: las migraciones deben cerrarlo.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export const DIR_MIGRACIONES = path.join(process.cwd(), "supabase", "migrations");

/** Migraciones en orden: [nombre, sql]. Si todavía no hay carpeta, devuelve la lista vacía. */
export function leerMigraciones(dir = DIR_MIGRACIONES): [string, string][] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")] as [string, string]);
}

/** Huella de las migraciones: si cambian, la base local de desarrollo se recrea sola. */
export function huellaMigraciones(dir = DIR_MIGRACIONES): string {
  const h = crypto.createHash("sha256");
  for (const [nombre, sql] of leerMigraciones(dir)) h.update(nombre).update(sql);
  return h.digest("hex").slice(0, 16);
}

/** Cuerpo de una petición tipo Supabase: rol + JWT. */
export function reclamosJwt(userId: string | null): string {
  return JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" });
}
