import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://ziwmkbghioyjncxrxugb.supabase.co'
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inppd21rYmdoaW95am5jeHJ4dWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTk2ODUsImV4cCI6MjA5NTc5NTY4NX0.3Whndw5WkqdUMQxpL7HkoGwwstxlrz392WAJUN0DKEo'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
