// Supabase Edge Function: Daily Task Generator
// This runs automatically every day to generate tasks for all users
// Deploy with: supabase functions deploy generate-daily-tasks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get all users with onboarding completed and active goals
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('onboarding_completed', true)

    if (usersError) {
      throw usersError
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users to process', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    console.log(`Processing ${users.length} users for daily task generation`)

    let totalTasksGenerated = 0
    let usersProcessed = 0
    const errors: string[] = []

    // Generate tasks for each user
    for (const user of users) {
      try {
        // Call the generate_daily_tasks function for this user
        const { data: result, error: genError } = await supabase
          .rpc('generate_daily_tasks', { p_user_id: user.id, p_date: new Date().toISOString().split('T')[0] })

        if (genError) {
          console.error(`Error generating tasks for user ${user.id}:`, genError)
          errors.push(`User ${user.id}: ${genError.message}`)
          continue
        }

        if (result && result > 0) {
          totalTasksGenerated += result
          usersProcessed++
          console.log(`Generated ${result} tasks for user ${user.id}`)
        }
      } catch (err) {
        console.error(`Exception for user ${user.id}:`, err)
        errors.push(`User ${user.id}: ${err.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalUsers: users.length,
        usersProcessed,
        totalTasksGenerated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Daily task generation error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
