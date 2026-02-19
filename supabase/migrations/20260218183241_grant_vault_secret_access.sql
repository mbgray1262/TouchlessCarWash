/*
  # Grant vault access to get_secret function

  Ensures the get_secret function is executable by the service role
  and has proper access to read from vault.decrypted_secrets.
*/

CREATE OR REPLACE FUNCTION get_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = vault, public
AS $$
DECLARE
  secret_value text;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  RETURN secret_value;
END;
$$;

GRANT EXECUTE ON FUNCTION get_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION get_secret(text) TO authenticated;
