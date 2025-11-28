/**
 * Plugin Installation Service
 * Handles recording and tracking of plugin installations
 */

const { supabase } = require('../../db/supabase-client');

/**
 * Record a plugin installation
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
    const payload = {
      email: data.email.toLowerCase(),
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

    console.log('[PluginInstallation] Recording installation:', payload);

    const { data: inserted, error } = await supabase
      .from('plugin_installations')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[PluginInstallation] Error recording installation:', error);
      return { success: false, error: error.message };
    }

    console.log('[PluginInstallation] Installation recorded successfully:', inserted.id);
    return { success: true, record: inserted };
  } catch (err) {
    console.error('[PluginInstallation] Exception recording installation:', err);
    return { success: false, error: err.message };
  }
}

module.exports = { recordInstallation };

