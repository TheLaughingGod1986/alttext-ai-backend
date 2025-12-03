/**
 * Plugin Installation Service
 * Handles recording and tracking of plugin installations
 */

const { supabase } = require('../../db/supabase-client');
const logger = require('../utils/logger');

/**
 * Record a plugin installation (upserts if exists)
 * @param {Object} data - Installation data
 * @param {string} data.email - User email
 * @param {string} data.plugin - Plugin slug/name
 * @param {string} [data.site] - Site URL
 * @param {string} [data.version] - Plugin version
 * @param {string} [data.wpVersion] - WordPress version
 * @param {string} [data.phpVersion] - PHP version
 * @param {string} [data.language] - Language code
 * @param {string} [data.timezone] - Timezone
 * @param {string} [data.installSource] - Installation source (default: 'plugin')
 * @returns {Promise<Object>} Result with success status and record or error
 */
async function recordInstallation(data) {
  try {
    const emailLower = data.email.toLowerCase();
    const payload = {
      email: emailLower,
      plugin_slug: data.plugin,
      site_url: data.site || null,
      version: data.version || null,
      wp_version: data.wpVersion || null,
      php_version: data.phpVersion || null,
      language: data.language || null,
      timezone: data.timezone || null,
      install_source: data.installSource || 'plugin',
      last_seen_at: new Date().toISOString(),
    };

    logger.info('[PluginInstallation] Recording installation', { email: emailLower, plugin: data.plugin, site: data.site });

    // Check if installation already exists (by email + plugin + site_url)
    const { data: existing, error: lookupError } = await supabase
      .from('plugin_installations')
      .select('*')
      .eq('email', emailLower)
      .eq('plugin_slug', data.plugin)
      .eq('site_url', data.site || null)
      .maybeSingle();

    let result;
    if (existing) {
      // Update existing installation
      const { data: updated, error: updateError } = await supabase
        .from('plugin_installations')
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        logger.error('[PluginInstallation] Error updating installation', {
          error: updateError.message,
          code: updateError.code,
          installationId: existing.id
        });
        return { success: false, error: updateError.message };
      }

      logger.info('[PluginInstallation] Installation updated successfully', { installationId: updated.id });
      result = { success: true, record: updated };
    } else {
      // Insert new installation
      const { data: inserted, error: insertError } = await supabase
        .from('plugin_installations')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        logger.error('[PluginInstallation] Error recording installation', {
          error: insertError.message,
          code: insertError.code,
          email: emailLower,
          plugin: data.plugin
        });
        return { success: false, error: insertError.message };
      }

      logger.info('[PluginInstallation] Installation recorded successfully', { installationId: inserted.id });
      result = { success: true, record: inserted };
    }

    return result;
  } catch (err) {
    logger.error('[PluginInstallation] Exception recording installation', {
      error: err.message,
      stack: err.stack,
      email: data?.email,
      plugin: data?.plugin
    });
    return { success: false, error: err.message };
  }
}

module.exports = { recordInstallation };

