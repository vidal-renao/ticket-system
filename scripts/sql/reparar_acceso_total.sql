-- =========================================================
-- PROYECTO: Vidal Real Estate - HelpDesk
-- DESCRIPCIÓN: Reparación de infraestructura, limpieza y roles.
-- FECHA: 2026-04-27
-- =========================================================

-- 1. ASEGURAR ESTRUCTURA DE TABLAS
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'offline';

-- 2. LIMPIEZA DE RUIDO (Borrado de esquemas duplicados)
DROP SCHEMA IF EXISTS helpdesk CASCADE;
DROP TABLE IF EXISTS public.tickets_backup_20260421;

-- 3. RESETEO DE USUARIOS Y PERFILES (Sincronización Total)
DO $$
DECLARE
    org_id UUID := '921f56a8-b2fe-4f24-bae9-fdf4863d4240';
BEGIN
    -- Forzar contraseñas en Auth
    UPDATE auth.users SET encrypted_password = crypt('Vidal2026!', gen_salt('bf')), email_confirmed_at = now()
    WHERE email IN ('vidalrenao.lab@outlook.com', 'empleado1@gmail.com', 'empresa1@gmail.com');

    -- Vincular Perfil ADMIN
    INSERT INTO public.profiles (id, full_name, role, organization_id, availability_status)
    SELECT id, 'Vidal Admin', 'admin', org_id, 'online' FROM auth.users WHERE email = 'vidalrenao.lab@outlook.com'
    ON CONFLICT (id) DO UPDATE SET role = 'admin', availability_status = 'online';

    -- Vincular Perfil AGENTE
    INSERT INTO public.profiles (id, full_name, role, organization_id, availability_status)
    SELECT id, 'Agente Vidal 1', 'agent', org_id, 'online' FROM auth.users WHERE email = 'empleado1@gmail.com'
    ON CONFLICT (id) DO UPDATE SET role = 'agent', availability_status = 'online';

    -- Vincular Perfil CLIENTE
    INSERT INTO public.profiles (id, full_name, role, organization_id, availability_status)
    SELECT id, 'Empresa Cliente', 'customer', org_id, 'offline' FROM auth.users WHERE email = 'empresa1@gmail.com'
    ON CONFLICT (id) DO UPDATE SET role = 'customer';
END $$;