
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const contentType = req.headers.get('content-type') || '';
        let reqData = null;
        let formData = null;

        if (contentType.includes('application/json')) {
            reqData = await req.json();
        } else if (contentType.includes('multipart/form-data')) {
            formData = await req.formData();
        }

        // Get Apps Script URL from secrets
        const appsScriptUrl = Deno.env.get('APPS_SCRIPT_URL');
        if (!appsScriptUrl) throw new Error('Missing APPS_SCRIPT_URL secret');

        // --- HANDLER: DELETE ---
        if (reqData && reqData.action === 'delete') {
            console.log('Processing DELETE action for:', reqData.fileId);

            const gasResponse = await fetch(appsScriptUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    fileId: reqData.fileId
                })
            });

            const gasData = await gasResponse.json();
            return new Response(JSON.stringify(gasData), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            });
        }

        // --- HANDLER: UPLOAD ---
        if (!formData) throw new Error('Invalid Request Format');

        const file = formData.get('file') as File
        if (!file) throw new Error('No file uploaded')

        console.log(`Processing UPLOAD file: ${file.name}, Size: ${file.size}`);

        const arrayBuffer = await file.arrayBuffer();
        const ui8 = new Uint8Array(arrayBuffer);
        const base64File = encode(ui8);

        console.log(`Forwarding UPLOAD to Apps Script`);

        // Send to Apps Script
        const gasResponse = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileData: base64File,
                fileName: file.name,
                mimeType: file.type || 'application/pdf',
            })
        });

        const gasData = await gasResponse.json();

        if (gasData.result !== 'success') {
            throw new Error(`Apps Script Error: ${gasData.error || 'Unknown error'}`);
        }

        return new Response(
            JSON.stringify({
                drive_id: gasData.fileId,
                web_view_link: gasData.fileUrl,
                message: 'Upload successful'
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        )

    } catch (error: any) {
        console.error('Edge Function Error:', error);
        return new Response(
            JSON.stringify({
                error: error.message,
                details: error.toString()
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400, // Apps Script errors usually mean bad input or config
            }
        )
    }
})
