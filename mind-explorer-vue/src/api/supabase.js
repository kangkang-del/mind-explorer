import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://bbdfeiceezcbcbsbnznr.supabase.co'
const supabaseKey = 'sb_publishable_cQdWdavPKrSJZw_GuNByyg_Eb9_v5vg'

export const supabase = createClient(supabaseUrl, supabaseKey)
