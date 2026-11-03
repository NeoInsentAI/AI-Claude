import { getSupabaseAdmin } from '../../src/lib/supabaseAdmin'

export interface Client {
  id: string
  name: string
  contact_person: string | null
  email: string
  address_line: string
  postal_code: string
  city: string
  country: string
  vat_number: string | null
  kvk_number: string | null
  created_at: string
}

export type NewClient = Omit<Client, 'id' | 'created_at'>

export async function listClients(): Promise<Client[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .select('*')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data as Client[]
}

export async function createClient(input: NewClient): Promise<Client> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .insert(input)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Client
}

export async function updateClient(id: string, input: NewClient): Promise<Client | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .update(input)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Client | null) ?? null
}

export async function getClientById(id: string): Promise<Client | null> {
  const { data, error } = await getSupabaseAdmin()
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Client | null) ?? null
}
