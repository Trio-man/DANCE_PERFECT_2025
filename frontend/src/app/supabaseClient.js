import { createClient } from '@supabase/supabase-js'

// Project URL and anon public key from Supabase settings
const supabaseUrl = 'https://vycitetgtnmlrszrtrhvk.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdX...<rest_of_your_key>'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
