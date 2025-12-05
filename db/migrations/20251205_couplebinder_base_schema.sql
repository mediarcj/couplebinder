--
-- PostgreSQL database dump
--

\restrict 4QOvSF6aDpMiai3XOUEYhPWEF9BMcLLw09hOCSs2KYcGsOSJwOVTzvSNWhSpWN1

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.gender AS ENUM (
    'male',
    'female',
    'non_binary',
    'other',
    'prefer_not_to_say'
);


--
-- Name: privacy_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.privacy_level AS ENUM (
    'public',
    'private',
    'followers'
);


--
-- Name: relationship_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.relationship_status AS ENUM (
    'single',
    'in_relationship',
    'married',
    'complicated',
    'separated',
    'divorced',
    'widowed',
    'prefer_not_to_say'
);


--
-- Name: _auth_last_signins(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._auth_last_signins() RETURNS TABLE(user_id uuid, last_sign_in_at timestamp with time zone)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select u.id::uuid, u.last_sign_in_at
  from auth.users u
$$;


--
-- Name: audit_profiles_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_profiles_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if (tg_op = 'INSERT') then
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('INSERT', new.user_id, auth.uid(), to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('UPDATE', new.user_id, auth.uid(), to_jsonb(new));
    return new;
  else
    -- DELETE
    insert into public.audit_profiles(verb, user_id, actor, snapshot)
    values ('DELETE', old.user_id, auth.uid(), to_jsonb(old));
    return old;
  end if;
end $$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Insert a new profile row for this auth user.
  insert into public.profiles (
    user_id, 
    email,
    given_name,
    family_name,
    display_name_override,
    phone
  )
  values (
    new.id, 
    new.email,
    coalesce(
      new.raw_user_meta_data->>'given_name',
      new.raw_user_meta_data->>'display_name'
    ),
    new.raw_user_meta_data->>'family_name',
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'phone'
  )
  -- If a profile already exists for this user_id, do nothing.
  on conflict (user_id) do nothing;

  -- Always return NEW from a trigger that fires on auth.users.
  return new;
end
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
      BEGIN
        IF NEW.user_id IS NULL THEN
          NEW.user_id := auth.uid();
        END IF;
        RETURN NEW;
      END;
      $$;


--
-- Name: touch_profiles_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end $$;


--
-- Name: trigger_set_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_health; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_health (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: artifacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artifacts (
    id character varying(255) NOT NULL,
    type character varying(100) NOT NULL,
    data jsonb NOT NULL,
    metadata jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_id uuid
);


--
-- Name: COLUMN artifacts.id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artifacts.id IS 'Unique artifact identifier';


--
-- Name: COLUMN artifacts.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artifacts.type IS 'Type of artifact (text, file, image, etc.)';


--
-- Name: COLUMN artifacts.data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artifacts.data IS 'Artifact content data';


--
-- Name: COLUMN artifacts.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.artifacts.metadata IS 'Flexible metadata storage';


--
-- Name: audit_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_profiles (
    at timestamp with time zone DEFAULT now() NOT NULL,
    verb text NOT NULL,
    user_id uuid,
    actor uuid,
    snapshot jsonb NOT NULL
);


--
-- Name: billing_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_customers (
    user_id uuid NOT NULL,
    stripe_customer_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email text,
    stripe_customer_id_live text,
    stripe_customer_id_test text
);


--
-- Name: binder_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.binder_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    binder_id text NOT NULL,
    page_number integer DEFAULT 1 NOT NULL,
    layout_json jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: binder_photos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.binder_photos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    binder_id uuid NOT NULL,
    user_id uuid NOT NULL,
    storage_key text NOT NULL,
    caption text,
    taken_at date,
    "position" integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mime_type text,
    size_bytes bigint,
    status text DEFAULT 'stored'::text NOT NULL,
    original_filename text
);


--
-- Name: binders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.binders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    cover_photo_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT binders_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'finalized'::text])))
);


--
-- Name: knex_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations (
    id integer NOT NULL,
    name character varying(255),
    batch integer,
    migration_time timestamp with time zone
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_id_seq OWNED BY public.knex_migrations.id;


--
-- Name: knex_migrations_lock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knex_migrations_lock (
    index integer NOT NULL,
    is_locked integer
);


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knex_migrations_lock_index_seq OWNED BY public.knex_migrations_lock.index;


--
-- Name: outbox_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.outbox_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    processed_at timestamp with time zone,
    scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
    retry_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT outbox_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'failed'::text])))
);


--
-- Name: payment_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_receipts (
    id bigint NOT NULL,
    user_id uuid,
    stripe_session_id text NOT NULL,
    stripe_payment_intent_id text,
    stripe_invoice_id text,
    stripe_customer_id text,
    product_key text,
    amount_total bigint NOT NULL,
    currency text NOT NULL,
    payment_status text NOT NULL,
    receipt_url text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_ms bigint NOT NULL,
    snapshot_json jsonb NOT NULL,
    snapshot_sha256 text NOT NULL,
    source text DEFAULT 'ui'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: payment_receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.payment_receipts ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.payment_receipts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stripe_payment_intent_id text,
    stripe_checkout_session_id text,
    price_id text NOT NULL,
    amount integer NOT NULL,
    currency text DEFAULT 'usd'::text NOT NULL,
    status text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_key text,
    receipt_url text,
    snapshot_json jsonb,
    snapshot_sha256 text,
    created_ms bigint
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    email text NOT NULL,
    given_name text,
    family_name text,
    display_name_override text,
    avatar_url text,
    locale text,
    timezone text,
    is_private boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_name text GENERATED ALWAYS AS (COALESCE(NULLIF(btrim(display_name_override), ''::text), NULLIF(btrim(((btrim(given_name) ||
CASE
    WHEN ((btrim(given_name) <> ''::text) AND (btrim(family_name) <> ''::text)) THEN ' '::text
    ELSE ''::text
END) || btrim(family_name))), ''::text), split_part(email, '@'::text, 1))) STORED,
    birthday date,
    gender public.gender,
    language text,
    city_province text,
    country text,
    social_media1 text,
    social_media2 text,
    social_media3 text,
    relationship_status public.relationship_status,
    job text,
    hobbies text[] DEFAULT '{}'::text[],
    music text[] DEFAULT '{}'::text[],
    fav_food text[] DEFAULT '{}'::text[],
    profile_title text,
    profile_description text,
    account_privacy public.privacy_level GENERATED ALWAYS AS (
CASE
    WHEN is_private THEN 'private'::public.privacy_level
    ELSE 'public'::public.privacy_level
END) STORED,
    phone text,
    CONSTRAINT profiles_account_privacy_check CHECK (((account_privacy IS NULL) OR (account_privacy = ANY (ARRAY['public'::public.privacy_level, 'private'::public.privacy_level])))),
    CONSTRAINT profiles_country_check CHECK (((char_length(country) >= 2) AND (char_length(country) <= 56))),
    CONSTRAINT profiles_display_name_override_len CHECK (((display_name_override IS NULL) OR (length(display_name_override) <= 100))),
    CONSTRAINT profiles_email_lower CHECK ((email = lower(email))),
    CONSTRAINT profiles_language_check CHECK (((length(language) >= 2) AND (length(language) <= 16))),
    CONSTRAINT profiles_phone_len CHECK (((phone IS NULL) OR (length(phone) <= 32))),
    CONSTRAINT profiles_profile_description_len CHECK (((profile_description IS NULL) OR (length(profile_description) <= 2000))),
    CONSTRAINT profiles_profile_title_len CHECK (((profile_title IS NULL) OR (length(profile_title) <= 140))),
    CONSTRAINT profiles_social_1_len CHECK (((social_media1 IS NULL) OR (length(social_media1) <= 140))),
    CONSTRAINT profiles_social_2_len CHECK (((social_media2 IS NULL) OR (length(social_media2) <= 140))),
    CONSTRAINT profiles_social_3_len CHECK (((social_media3 IS NULL) OR (length(social_media3) <= 140)))
);


--
-- Name: quotas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotas (
    id integer NOT NULL,
    user_id uuid NOT NULL,
    quota_type character varying(100) NOT NULL,
    "limit" integer NOT NULL,
    used integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: COLUMN quotas.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotas.user_id IS 'User ID or IP address for quota tracking';


--
-- Name: COLUMN quotas.quota_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotas.quota_type IS 'Type of quota (submissions, api_calls, etc.)';


--
-- Name: COLUMN quotas."limit"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotas."limit" IS 'Maximum allowed quota';


--
-- Name: COLUMN quotas.used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotas.used IS 'Currently used quota';


--
-- Name: quotas_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.quotas_id_seq OWNED BY public.quotas.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    role text NOT NULL
);


--
-- Name: submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    text text NOT NULL,
    text_length integer NOT NULL,
    client_ip character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    user_id uuid
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    password text NOT NULL,
    first_name character varying(255) NOT NULL,
    last_name character varying(255) NOT NULL,
    phone character varying(255),
    birthday date,
    gender character varying(255),
    language character varying(255) DEFAULT 'English'::character varying,
    city_province character varying(255),
    country character varying(255),
    social_media1 character varying(255),
    social_media2 character varying(255),
    social_media3 character varying(255),
    relationship_status character varying(255),
    job character varying(255),
    hobbies character varying(255),
    music character varying(255),
    fav_food character varying(255),
    profile_title character varying(255),
    profile_description text,
    account_privacy character varying(255) DEFAULT 'public'::character varying,
    user_role character varying(255) DEFAULT 'user'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: v_profiles_full; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_profiles_full AS
 SELECT p.user_id,
    COALESCE(NULLIF(TRIM(BOTH FROM p.display_name_override), ''::text), NULLIF(TRIM(BOTH FROM concat_ws(' '::text, NULLIF(TRIM(BOTH FROM p.given_name), ''::text), NULLIF(TRIM(BOTH FROM p.family_name), ''::text))), ''::text), split_part(p.email, '@'::text, 1)) AS display_name,
    p.email,
    p.phone,
    p.given_name,
    p.family_name,
    p.avatar_url,
    p.birthday,
    p.gender,
    p.language,
    p.city_province,
    p.country,
    p.social_media1,
    p.social_media2,
    p.social_media3,
    p.relationship_status,
    p.job,
    p.hobbies,
    p.music,
    p.fav_food,
    p.profile_title,
    p.profile_description,
    COALESCE(p.account_privacy, 'public'::public.privacy_level) AS account_privacy,
    p.locale,
    p.timezone,
    p.created_at,
    p.updated_at,
        CASE
            WHEN ((auth.uid() = p.user_id) OR (EXISTS ( SELECT 1
               FROM public.user_roles ur_1
              WHERE ((ur_1.user_id = auth.uid()) AND (ur_1.role = ANY (ARRAY['admin'::text, 'super_user'::text]))))) OR (COALESCE(current_setting('request.jwt.claim.role'::text, true), ''::text) = 'service_role'::text)) THEN als.last_sign_in_at
            ELSE NULL::timestamp with time zone
        END AS last_sign_in_at,
    COALESCE(array_agg(ur.role) FILTER (WHERE (ur.role IS NOT NULL)), '{}'::text[]) AS roles
   FROM ((public.profiles p
     LEFT JOIN public.user_roles ur ON ((ur.user_id = p.user_id)))
     LEFT JOIN public._auth_last_signins() als(user_id, last_sign_in_at) ON ((als.user_id = p.user_id)))
  GROUP BY p.user_id, p.email, p.phone, p.given_name, p.family_name, p.display_name_override, p.avatar_url, p.birthday, p.gender, p.language, p.city_province, p.country, p.social_media1, p.social_media2, p.social_media3, p.relationship_status, p.job, p.hobbies, p.music, p.fav_food, p.profile_title, p.profile_description, p.account_privacy, p.locale, p.timezone, p.created_at, p.updated_at, als.last_sign_in_at;


--
-- Name: knex_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations ALTER COLUMN id SET DEFAULT nextval('public.knex_migrations_id_seq'::regclass);


--
-- Name: knex_migrations_lock index; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock ALTER COLUMN index SET DEFAULT nextval('public.knex_migrations_lock_index_seq'::regclass);


--
-- Name: quotas id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas ALTER COLUMN id SET DEFAULT nextval('public.quotas_id_seq'::regclass);


--
-- Name: app_health app_health_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_health
    ADD CONSTRAINT app_health_pkey PRIMARY KEY (id);


--
-- Name: artifacts artifacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_pkey PRIMARY KEY (id);


--
-- Name: billing_customers billing_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_pkey PRIMARY KEY (user_id);


--
-- Name: billing_customers billing_customers_stripe_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_stripe_customer_id_key UNIQUE (stripe_customer_id);


--
-- Name: binder_layouts binder_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_layouts
    ADD CONSTRAINT binder_layouts_pkey PRIMARY KEY (id);


--
-- Name: binder_layouts binder_layouts_user_binder_page_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_layouts
    ADD CONSTRAINT binder_layouts_user_binder_page_key UNIQUE (user_id, binder_id, page_number);


--
-- Name: binder_layouts binder_layouts_user_binder_page_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_layouts
    ADD CONSTRAINT binder_layouts_user_binder_page_unique UNIQUE (user_id, binder_id, page_number);


--
-- Name: binder_photos binder_photos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_photos
    ADD CONSTRAINT binder_photos_pkey PRIMARY KEY (id);


--
-- Name: binders binders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binders
    ADD CONSTRAINT binders_pkey PRIMARY KEY (id);


--
-- Name: knex_migrations_lock knex_migrations_lock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations_lock
    ADD CONSTRAINT knex_migrations_lock_pkey PRIMARY KEY (index);


--
-- Name: knex_migrations knex_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knex_migrations
    ADD CONSTRAINT knex_migrations_pkey PRIMARY KEY (id);


--
-- Name: outbox_events outbox_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.outbox_events
    ADD CONSTRAINT outbox_events_pkey PRIMARY KEY (id);


--
-- Name: payment_receipts payment_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_pkey PRIMARY KEY (id);


--
-- Name: payment_receipts payment_receipts_stripe_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_stripe_session_id_key UNIQUE (stripe_session_id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_checkout_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stripe_checkout_session_id_key UNIQUE (stripe_checkout_session_id);


--
-- Name: payments payments_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);


--
-- Name: quotas quotas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas
    ADD CONSTRAINT quotas_pkey PRIMARY KEY (id);


--
-- Name: quotas quotas_user_id_quota_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas
    ADD CONSTRAINT quotas_user_id_quota_type_unique UNIQUE (user_id, quota_type);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (role);


--
-- Name: submissions submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role);


--
-- Name: users users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_unique UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: artifacts_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artifacts_created_at_index ON public.artifacts USING btree (created_at);


--
-- Name: artifacts_type_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artifacts_type_created_at_index ON public.artifacts USING btree (type, created_at);


--
-- Name: artifacts_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX artifacts_type_index ON public.artifacts USING btree (type);


--
-- Name: binder_layouts_user_binder_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX binder_layouts_user_binder_page_idx ON public.binder_layouts USING btree (user_id, binder_id, page_number);


--
-- Name: idx_billing_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_email ON public.billing_customers USING btree (email);


--
-- Name: idx_billing_customers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_billing_customers_user ON public.billing_customers USING btree (user_id);


--
-- Name: idx_billing_customers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_billing_customers_user_id ON public.billing_customers USING btree (user_id);


--
-- Name: idx_binder_photos_binder_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binder_photos_binder_position ON public.binder_photos USING btree (binder_id, "position");


--
-- Name: idx_binder_photos_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binder_photos_user_id ON public.binder_photos USING btree (user_id, created_at DESC);


--
-- Name: idx_binders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_binders_user_id ON public.binders USING btree (user_id, created_at DESC);


--
-- Name: idx_outbox_attempts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_attempts ON public.outbox_events USING btree (attempts);


--
-- Name: idx_outbox_status_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbox_status_created_at ON public.outbox_events USING btree (status, created_at);


--
-- Name: idx_payment_receipts_pi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_receipts_pi ON public.payment_receipts USING btree (stripe_payment_intent_id);


--
-- Name: idx_payment_receipts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_receipts_user_id ON public.payment_receipts USING btree (user_id);


--
-- Name: idx_payments_checkout_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payments_checkout_session_id ON public.payments USING btree (stripe_checkout_session_id);


--
-- Name: idx_payments_payment_intent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_payment_intent_id ON public.payments USING btree (stripe_payment_intent_id);


--
-- Name: idx_payments_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_session ON public.payments USING btree (stripe_checkout_session_id);


--
-- Name: idx_payments_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_created ON public.payments USING btree (user_id, created_at DESC);


--
-- Name: idx_payments_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_id ON public.payments USING btree (user_id);


--
-- Name: idx_payments_user_id_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_id_created_at ON public.payments USING btree (user_id, created_at DESC);


--
-- Name: idx_profiles_display_name_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_display_name_search ON public.profiles USING gin (to_tsvector('simple'::regconfig, display_name));


--
-- Name: idx_profiles_display_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_display_name_trgm ON public.profiles USING gin (display_name public.gin_trgm_ops);


--
-- Name: idx_profiles_email_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email_lower ON public.profiles USING btree (lower(email));


--
-- Name: idx_profiles_privacy; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_privacy ON public.profiles USING btree (account_privacy);


--
-- Name: idx_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_profiles_user_id ON public.profiles USING btree (user_id);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: payments_checkout_session_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_checkout_session_id_idx ON public.payments USING btree (stripe_checkout_session_id);


--
-- Name: payments_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_created_at_idx ON public.payments USING btree (created_at);


--
-- Name: payments_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_status_idx ON public.payments USING btree (status);


--
-- Name: payments_stripe_checkout_session_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_stripe_checkout_session_id_uniq ON public.payments USING btree (stripe_checkout_session_id);


--
-- Name: payments_stripe_payment_intent_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_stripe_payment_intent_id_idx ON public.payments USING btree (stripe_payment_intent_id);


--
-- Name: payments_stripe_payment_intent_id_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX payments_stripe_payment_intent_id_uniq ON public.payments USING btree (stripe_payment_intent_id);


--
-- Name: payments_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payments_user_id_idx ON public.payments USING btree (user_id);


--
-- Name: quotas_quota_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotas_quota_type_index ON public.quotas USING btree (quota_type);


--
-- Name: quotas_user_id_quota_type_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quotas_user_id_quota_type_index ON public.quotas USING btree (user_id, quota_type);


--
-- Name: submissions_client_ip_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submissions_client_ip_index ON public.submissions USING btree (client_ip);


--
-- Name: submissions_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX submissions_created_at_index ON public.submissions USING btree (created_at);


--
-- Name: users_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_created_at_index ON public.users USING btree (created_at);


--
-- Name: users_email_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_email_index ON public.users USING btree (email);


--
-- Name: users_user_role_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_user_role_index ON public.users USING btree (user_role);


--
-- Name: billing_customers set_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp BEFORE UPDATE ON public.billing_customers FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: payments set_timestamp_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_timestamp_payments BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.trigger_set_timestamp();


--
-- Name: outbox_events set_updated_at_on_outbox; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_on_outbox BEFORE UPDATE ON public.outbox_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_profiles_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_audit AFTER INSERT OR DELETE OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.audit_profiles_change();


--
-- Name: profiles trg_profiles_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_updated_at();


--
-- Name: artifacts trg_set_user_id_artifacts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_user_id_artifacts BEFORE INSERT ON public.artifacts FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


--
-- Name: quotas trg_set_user_id_quotas; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_user_id_quotas BEFORE INSERT ON public.quotas FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


--
-- Name: submissions trg_set_user_id_submissions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_user_id_submissions BEFORE INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.set_user_id();


--
-- Name: artifacts artifacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifacts
    ADD CONSTRAINT artifacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: billing_customers billing_customers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_customers
    ADD CONSTRAINT billing_customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: binder_layouts binder_layouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_layouts
    ADD CONSTRAINT binder_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: binder_photos binder_photos_binder_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_photos
    ADD CONSTRAINT binder_photos_binder_fk FOREIGN KEY (binder_id) REFERENCES public.binders(id) ON DELETE CASCADE;


--
-- Name: binder_photos binder_photos_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binder_photos
    ADD CONSTRAINT binder_photos_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: binders binders_cover_photo_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binders
    ADD CONSTRAINT binders_cover_photo_fk FOREIGN KEY (cover_photo_id) REFERENCES public.binder_photos(id) ON DELETE SET NULL;


--
-- Name: binders binders_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.binders
    ADD CONSTRAINT binders_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_receipts payment_receipts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_receipts
    ADD CONSTRAINT payment_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quotas quotas_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotas
    ADD CONSTRAINT quotas_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: submissions submissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_fkey FOREIGN KEY (role) REFERENCES public.roles(role) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: artifacts Users can create their own artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own artifacts" ON public.artifacts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: quotas Users can create their own quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own quotas" ON public.quotas FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: submissions Users can create their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own submissions" ON public.submissions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: artifacts Users can delete their own artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own artifacts" ON public.artifacts FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: quotas Users can delete their own quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own quotas" ON public.quotas FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: submissions Users can delete their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own submissions" ON public.submissions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: artifacts Users can update their own artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own artifacts" ON public.artifacts FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: users Users can update their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING ((auth.uid() = id));


--
-- Name: quotas Users can update their own quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own quotas" ON public.quotas FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: submissions Users can update their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own submissions" ON public.submissions FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: artifacts Users can view their own artifacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own artifacts" ON public.artifacts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: users Users can view their own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING ((auth.uid() = id));


--
-- Name: quotas Users can view their own quotas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own quotas" ON public.quotas FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: submissions Users can view their own submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own submissions" ON public.submissions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: app_health; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_health ENABLE ROW LEVEL SECURITY;

--
-- Name: artifacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_profiles audit_profiles_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_profiles_admin_read ON public.audit_profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'super_user'::text]))))));


--
-- Name: billing_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: binder_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.binder_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: binder_layouts binder_layouts_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_layouts_insert_own ON public.binder_layouts FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: binder_layouts binder_layouts_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_layouts_select_own ON public.binder_layouts FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: binder_layouts binder_layouts_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_layouts_update_own ON public.binder_layouts FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: binder_photos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.binder_photos ENABLE ROW LEVEL SECURITY;

--
-- Name: binder_photos binder_photos_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_photos_delete_own ON public.binder_photos FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: binder_photos binder_photos_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_photos_insert_own ON public.binder_photos FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: binder_photos binder_photos_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_photos_select_own ON public.binder_photos FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: binder_photos binder_photos_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binder_photos_update_own ON public.binder_photos FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: binders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.binders ENABLE ROW LEVEL SECURITY;

--
-- Name: binders binders_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binders_delete_own ON public.binders FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: binders binders_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binders_insert_own ON public.binders FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: binders binders_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binders_select_own ON public.binders FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: binders binders_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY binders_update_own ON public.binders FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: knex_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knex_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: knex_migrations_lock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.knex_migrations_lock ENABLE ROW LEVEL SECURITY;

--
-- Name: knex_migrations no_access_knex_migrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_access_knex_migrations ON public.knex_migrations USING (false) WITH CHECK (false);


--
-- Name: knex_migrations_lock no_access_knex_migrations_lock; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_access_knex_migrations_lock ON public.knex_migrations_lock USING (false) WITH CHECK (false);


--
-- Name: app_health no_direct_app_health_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_direct_app_health_access ON public.app_health USING (false) WITH CHECK (false);


--
-- Name: outbox_events no_direct_outbox_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_direct_outbox_access ON public.outbox_events USING (false) WITH CHECK (false);


--
-- Name: roles no_direct_roles_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_direct_roles_access ON public.roles USING (false) WITH CHECK (false);


--
-- Name: outbox_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.outbox_events ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_receipts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_read ON public.profiles FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'super_user'::text]))))));


--
-- Name: profiles profiles_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'super_user'::text]))))));


--
-- Name: profiles profiles_insert_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_self ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: profiles profiles_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_public_read ON public.profiles FOR SELECT USING ((COALESCE(account_privacy, 'public'::public.privacy_level) = 'public'::public.privacy_level));


--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: quotas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_customers select own billing_customer; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own billing_customer" ON public.billing_customers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: payments select own payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select own payments" ON public.payments FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: billing_customers service role manage billing_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role manage billing_customers" ON public.billing_customers USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: payments service role manage payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service role manage payments" ON public.payments USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles user_roles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_admin_all ON public.user_roles USING ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'super_user'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'super_user'::text]))))));


--
-- Name: user_roles user_roles_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_roles_read_own ON public.user_roles FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_receipts users can view own receipts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can view own receipts" ON public.payment_receipts FOR SELECT USING ((auth.uid() = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict 4QOvSF6aDpMiai3XOUEYhPWEF9BMcLLw09hOCSs2KYcGsOSJwOVTzvSNWhSpWN1

