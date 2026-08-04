const supabase = require('../lib/supabaseClient');

/**
 * Stockage Supabase (PostgreSQL heberge).
 *
 * Mode optionnel, active avec STORAGE_DRIVER=supabase. Utile pour heberger
 * Mew en ligne et le partager entre plusieurs personnes. Pour un usage
 * personnel sur sa propre machine, le stockage local (jsonAdapter) est
 * plus simple et ne demande aucun compte.
 *
 * Le SQL de creation des deux tables est dans le README.
 */

const applications = {
  async create(userId, data) {
    const { data: application, error } = await supabase
      .from('job_applications')
      .insert({
        user_id: userId,
        offer_title: data.offer_title,
        company: data.company || '',
        offer_url: data.offer_url || '',
        location: data.location || '',
        contract_type: data.contract_type || '',
        status: data.status || 'a_postuler',
        notes: data.notes || '',
        recipient_email: data.recipient_email || '',
        follow_up_date: data.follow_up_date || null,
        follow_up_sent: data.follow_up_sent ?? false,
        candidature_type: data.candidature_type || 'offre',
        contact_name: data.contact_name || '',
        // Une candidature creee « postule » a forcement ete envoyee maintenant.
        applied_at: data.applied_at || (data.status === 'postule' ? new Date().toISOString() : null)
      })
      .select()
      .single();

    if (error) throw new Error(`Erreur creation candidature: ${error.message}`);
    return application;
  },

  async getByUser(userId) {
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Erreur recuperation candidatures: ${error.message}`);
    return data || [];
  },

  async getById(id, userId) {
    const { data, error } = await supabase
      .from('job_applications')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  },

  async update(id, userId, data) {
    const updateData = { updated_at: new Date().toISOString() };

    const champs = [
      'status', 'notes', 'offer_title', 'company', 'offer_url', 'location',
      'contract_type', 'recipient_email', 'follow_up_date', 'follow_up_sent',
      'candidature_type', 'contact_name'
    ];
    champs.forEach((champ) => {
      if (data[champ] !== undefined) updateData[champ] = data[champ];
    });

    if (data.status === 'postule' && data.applied_at !== null) {
      updateData.applied_at = data.applied_at || new Date().toISOString();
    }

    const { data: updated, error } = await supabase
      .from('job_applications')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(`Erreur mise a jour candidature: ${error.message}`);
    return updated;
  },

  async delete(id, userId) {
    const { error } = await supabase
      .from('job_applications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new Error(`Erreur suppression candidature: ${error.message}`);
  }
};

const history = {
  async save(userId, toolType, title, inputSummary, resultSummary, status = 'completed') {
    const { data, error } = await supabase
      .from('tool_usage_history')
      .insert({
        user_id: userId,
        tool_type: toolType,
        title,
        input_summary: inputSummary || {},
        result_summary: resultSummary || {},
        status
      })
      .select()
      .single();

    if (error) throw new Error(`Erreur sauvegarde historique : ${error.message}`);
    return data;
  },

  async list(userId, filters = {}) {
    let query = supabase
      .from('tool_usage_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (filters.toolType) query = query.eq('tool_type', filters.toolType);
    if (filters.limit) query = query.limit(filters.limit);

    const { data, error } = await query;
    if (error) throw new Error(`Erreur historique : ${error.message}`);
    return data || [];
  },

  async delete(id, userId) {
    const { error } = await supabase
      .from('tool_usage_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new Error(`Erreur suppression : ${error.message}`);
    return true;
  }
};

module.exports = { applications, history };
