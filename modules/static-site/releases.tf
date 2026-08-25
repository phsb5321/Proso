# The add-on auto-update payload.
#
# Two failure modes here are silent — nothing errors, nothing 500s, users simply
# stop receiving updates or cannot install. Both are encoded as resource
# arguments so a regression fails `terraform plan`, not a user's browser:
#
#   1. Every .xpi is served as application/x-xpinstall. Firefox refuses to
#      install an add-on offered under any other content type.
#   2. updates.json lands at the site ROOT and the .xpi files at releases/.
#      The update_url compiled into every already-installed copy of the
#      extension is absolute; move the manifest under a prefix and every
#      installed extension silently stops updating, with no way to tell them.
#
# Terraform owns these objects for that reason. scripts/deploy-site.sh syncs the
# marketing pages and explicitly excludes these keys.

locals {
  release_dir   = local.release_enabled ? var.release_source_dir : null
  updates_path  = local.release_enabled ? "${var.release_source_dir}/updates.json" : null
  release_files = local.release_enabled ? fileset("${var.release_source_dir}/releases", "*.xpi") : toset([])

  # Every update_link advertised by the manifest, used to check that the
  # manifest points at the site it is being published to.
  update_links = local.release_enabled ? flatten([
    for addon in values(jsondecode(file(local.updates_path)).addons) : [
      for update in addon.updates : update.update_link
    ]
  ]) : []
}

resource "aws_s3_object" "release" {
  for_each = local.release_files

  bucket = aws_s3_bucket.site.id

  # INVARIANT 2: releases/ at the site root. Not var-interpolated on purpose.
  key = "releases/${each.value}"

  # INVARIANT 1: Firefox will not install any other content type.
  content_type = "application/x-xpinstall"

  source      = "${var.release_source_dir}/releases/${each.value}"
  source_hash = filemd5("${var.release_source_dir}/releases/${each.value}")

  tags = var.tags
}

resource "aws_s3_object" "updates_manifest" {
  count = local.release_enabled ? 1 : 0

  bucket = aws_s3_bucket.site.id

  # INVARIANT 2: the manifest is at the root, matching the absolute update_url
  # already compiled into every installed extension.
  key = "updates.json"

  content_type = "application/json"

  source      = local.updates_path
  source_hash = filemd5(local.updates_path)

  tags = var.tags

  lifecycle {
    precondition {
      condition = !var.attach_custom_domain || alltrue([
        for link in local.update_links : strcontains(link, var.domain_names[0])
      ])
      error_message = "updates.json advertises update_link hosts outside ${var.domain_names[0]}; publishing it here would point installed extensions at the old host. Links found: ${join(", ", local.update_links)}"
    }
  }
}
