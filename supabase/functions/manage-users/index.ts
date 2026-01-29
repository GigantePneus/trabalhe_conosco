
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('CONFIG_ERROR: URL or Service Role missing in environment');
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        const body = await req.json();
        const { action, ...payload } = body;

        let result;

        switch (action) {
            case 'create_user': {
                const { email, password, nome, role, lojas_permitidas, cargos_permitidos } = payload;

                console.log(`Creating user: ${email}, nome: ${nome}`);

                // A. Create in Auth
                const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: { full_name: nome }
                });

                if (authError) throw new Error(`AUTH_ERROR: ${authError.message}`);

                // B. Insert in admin_users (Resilient)
                const { data: dbUser, error: dbError } = await supabaseAdmin
                    .from('admin_users')
                    .insert([{
                        id: authUser.user.id,
                        nome,
                        email,
                        role,
                        lojas_permitidas: lojas_permitidas || [],
                        cargos_permitidos: cargos_permitidos || []
                    }])
                    .select()
                    .single();

                if (dbError) {
                    throw new Error(`DB_FATAL_ERROR: ${dbError.message}. Certifique-se de que as colunas 'lojas_permitidas' e 'cargos_permitidos' existam na tabela admin_users.`);
                }
                result = dbUser;
                break;
            }

            case 'update_user': {
                const { id, nome, email, role, lojas_permitidas, cargos_permitidos } = payload;

                // Update DB (Resilient)
                const { data: dbUpdate, error: dbUpdateError } = await supabaseAdmin
                    .from('admin_users')
                    .update({
                        nome,
                        email,
                        role,
                        lojas_permitidas: lojas_permitidas || [],
                        cargos_permitidos: cargos_permitidos || []
                    })
                    .eq('id', id)
                    .select()
                    .single();

                if (dbUpdateError) {
                    throw new Error(`DB_UPDATE_ERROR: ${dbUpdateError.message}. Verifique se as colunas de permissão existem.`);
                }
                result = dbUpdate;

                // Also sync full_name to Auth metadata
                await supabaseAdmin.auth.admin.updateUserById(id, { user_metadata: { full_name: nome } });
                break;
            }

            case 'delete_user': {
                const { userId } = payload;
                const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
                // Note: admin_users is FK references with on delete cascade, so it should be removed automatically.
                // But we can be explicit:
                await supabaseAdmin.from('admin_users').delete().eq('id', userId);

                if (authDeleteError) throw new Error(`AUTH_DELETE_ERROR: ${authDeleteError.message}`);
                result = { success: true };
                break;
            }

            case 'update_password': {
                const { userId, newPassword } = payload;
                const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
                if (error) throw new Error(`PASS_UPDATE_ERROR: ${error.message}`);
                result = { success: true };
                break;
            }

            default:
                throw new Error(`INVALID_ACTION: ${action}`);
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Function Error:", error.message);
        return new Response(
            JSON.stringify({ error: true, message: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, // Kept 200 to allow frontend to handle our JSON error object
            }
        )
    }
})
