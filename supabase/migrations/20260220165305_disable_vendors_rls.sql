/*
  # Disable RLS on vendors table

  Allows anonymous/unauthenticated admin operations (insert, update) on the vendors table.
*/

ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
