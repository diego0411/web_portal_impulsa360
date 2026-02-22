import { supabase } from './supabaseClient'

export async function fetchAllActivaciones({ pageSize = 1000, columns = '*' } = {}) {
  const rows = []
  let from = 0
  let to = pageSize - 1

  while (true) {
    const { data, error } = await supabase
      .from('activaciones')
      .select(columns)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    if (!data || data.length === 0) {
      break
    }

    rows.push(...data)

    if (data.length < pageSize) {
      break
    }

    from += pageSize
    to += pageSize
  }

  return rows
}
