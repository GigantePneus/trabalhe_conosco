import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hidayzojjztfyuefmknz.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhpZGF5em9qanp0Znl1ZWZta256Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQyMDE3MTksImV4cCI6MjEwOTc3NzcxOX0.Shg4levkuEAxmUfJeDn8bwmemKKl2ljlzIIxoMIHmF0';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
