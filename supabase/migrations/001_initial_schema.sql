-- Schema for Klip Video Platform & Multi-Platform Publishing

-- 1. Create profiles table (links with auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create social_accounts table
create table if not exists public.social_accounts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  platform text not null check (platform in ('youtube', 'tiktok', 'instagram')),
  platform_user_id text,
  account_name text not null,
  account_handle text,
  avatar_url text,
  access_token text,
  refresh_token text,
  expires_at bigint,
  status text default 'connected' check (status in ('connected', 'disconnected', 'expired')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_id, platform, platform_user_id)
);

-- 3. Create publications table
create table if not exists public.publications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  description text,
  hashtags jsonb default '[]'::jsonb,
  video_url text not null,
  thumbnail_url text,
  status text default 'pending',
  results jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Enable RLS
alter table public.profiles enable row level security;
alter table public.social_accounts enable row level security;
alter table public.publications enable row level security;

-- 5. Policies
create policy "Users can view and edit their own profile" on public.profiles
  for all using (auth.uid() = id);

create policy "Users can view and manage their connected social accounts" on public.social_accounts
  for all using (auth.uid() = user_id);

create policy "Users can view and manage their publications" on public.publications
  for all using (auth.uid() = user_id);

-- 6. Storage bucket setup for video uploads
insert into storage.buckets (id, name, public)
values ('klip-videos', 'klip-videos', true)
on conflict (id) do nothing;

create policy "Public can view klip videos" on storage.objects
  for select using (bucket_id = 'klip-videos');

create policy "Authenticated users can upload klip videos" on storage.objects
  for insert with check (bucket_id = 'klip-videos');
