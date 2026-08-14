-- Proposal templates, proposals, versions, items, acceptances, public links

CREATE TABLE public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  introduction text,
  project_overview text,
  objectives text,
  scope text,
  deliverables text,
  timeline text,
  payment_terms text,
  terms_and_conditions text,
  notes text,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_templates_name_not_blank CHECK (length(trim(name)) > 0)
);

CREATE TRIGGER proposal_templates_set_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX proposal_templates_one_default_idx
  ON public.proposal_templates ((true))
  WHERE is_default = true AND is_archived = false;

CREATE TABLE public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE RESTRICT,
  proposal_number text NOT NULL,
  title text NOT NULL,
  status public.proposal_status NOT NULL DEFAULT 'draft',
  current_version_id uuid,
  expires_at timestamptz,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposals_number_unique UNIQUE (proposal_number),
  CONSTRAINT proposals_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT proposals_number_not_blank CHECK (length(trim(proposal_number)) > 0)
);

CREATE TRIGGER proposals_set_updated_at
  BEFORE UPDATE ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX proposals_client_id_idx ON public.proposals (client_id);
CREATE INDEX proposals_project_id_idx ON public.proposals (project_id);
CREATE INDEX proposals_status_idx ON public.proposals (status);

CREATE TABLE public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals (id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  title text NOT NULL,
  introduction text,
  project_overview text,
  objectives text,
  scope text,
  deliverables text,
  timeline text,
  payment_schedule text,
  terms_and_conditions text,
  notes text,
  sections jsonb NOT NULL DEFAULT '{}'::jsonb,
  subtotal_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  total_minor bigint NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'CAD',
  expires_at timestamptz,
  is_immutable boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_versions_unique_number UNIQUE (proposal_id, version_number),
  CONSTRAINT proposal_versions_version_positive CHECK (version_number >= 1),
  CONSTRAINT proposal_versions_title_not_blank CHECK (length(trim(title)) > 0),
  CONSTRAINT proposal_versions_money_non_negative CHECK (
    subtotal_minor >= 0
    AND discount_minor >= 0
    AND tax_minor >= 0
    AND total_minor >= 0
  )
);

CREATE INDEX proposal_versions_proposal_id_idx ON public.proposal_versions (proposal_id);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.proposal_versions (id)
  ON DELETE SET NULL;

CREATE TABLE public.proposal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_version_id uuid NOT NULL REFERENCES public.proposal_versions (id) ON DELETE CASCADE,
  item_type public.proposal_item_type NOT NULL DEFAULT 'service',
  description text NOT NULL,
  quantity numeric(12, 4) NOT NULL DEFAULT 1,
  rate_minor bigint NOT NULL DEFAULT 0,
  amount_minor bigint NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  optional boolean NOT NULL DEFAULT false,
  selected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_items_description_not_blank CHECK (length(trim(description)) > 0),
  CONSTRAINT proposal_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT proposal_items_rate_non_negative CHECK (rate_minor >= 0),
  CONSTRAINT proposal_items_amount_non_negative CHECK (amount_minor >= 0)
);

CREATE INDEX proposal_items_proposal_version_id_idx ON public.proposal_items (proposal_version_id);

CREATE TABLE public.proposal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals (id) ON DELETE RESTRICT,
  proposal_version_id uuid NOT NULL REFERENCES public.proposal_versions (id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  accepted_by_name text NOT NULL,
  accepted_by_email text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  acceptance_method text NOT NULL DEFAULT 'secure_link',
  evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_acceptances_name_not_blank CHECK (length(trim(accepted_by_name)) > 0),
  CONSTRAINT proposal_acceptances_email_not_blank CHECK (length(trim(accepted_by_email)) > 0)
);

-- One acceptance record per proposal version (exact accepted snapshot)
CREATE UNIQUE INDEX proposal_acceptances_version_unique_idx
  ON public.proposal_acceptances (proposal_version_id);

CREATE INDEX proposal_acceptances_proposal_id_idx ON public.proposal_acceptances (proposal_id);
CREATE INDEX proposal_acceptances_client_id_idx ON public.proposal_acceptances (client_id);

COMMENT ON TABLE public.proposal_acceptances IS
  'Legal/evidence record of client acceptance for an exact proposal version. Retain minimally (ip/user_agent optional).';

CREATE TABLE public.public_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type public.public_link_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_accessed_at timestamptz,
  CONSTRAINT public_links_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT public_links_token_hash_not_blank CHECK (length(trim(token_hash)) >= 32)
);

CREATE INDEX public_links_resource_idx ON public.public_links (resource_type, resource_id);

COMMENT ON TABLE public.public_links IS
  'Capability links. Store only cryptographic hashes of high-entropy tokens — never plaintext tokens.';
COMMENT ON COLUMN public.public_links.token_hash IS
  'SHA-256 (or stronger) hex/base64 digest of the public token. Plaintext must not be persisted.';
