module "site" {
  source = "../../modules/static-site"

  name                 = var.name
  domain_names         = var.domain_names
  attach_custom_domain = var.attach_custom_domain
  release_source_dir   = var.site_source_dir
}
