  app.patch('/admin/teams/:teamId', asyncRoute(async (req, res) => {
    const teamId = normalizeText(req.params.teamId)
    const numero = Number(req.body?.numero)
    const nombre = normalizeText(req.body?.nombre)
    const plazaId = normalizeNullableText(req.body?.plaza_id)
    const liderId = normalizeNullableText(req.body?.lider_id)

    const facturadorId = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'facturador_id')
      ? normalizeNullableText(req.body.facturador_id)
      : undefined

    const activo = req.body?.activo

    if (
      !teamId ||
      !Number.isSafeInteger(numero) ||
      numero <= 0 ||
      !nombre ||
      !plazaId ||
      typeof activo !== 'boolean'
    ) {
      jsonError(res, 400, 'Numero, nombre, plaza y estado son obligatorios.')
      return
    }

    const { data: duplicateTeam, error: duplicateError } = await adminSupabase
      .from('equipos')
      .select('id')
      .eq('numero', numero)
      .neq('id', teamId)
      .limit(1)

    if (duplicateError && isMissingOrganizationSchema(duplicateError)) {
      jsonError(
        res,
        409,
        'La gestion de equipos estara disponible cuando se habilite el modelo organizacional.'
      )
      return
    }

    if (duplicateError) {
      jsonError(
        res,
        500,
        'No se pudo validar el numero de equipo.',
        duplicateError.message
      )
      return
    }

    if (duplicateTeam?.length) {
      jsonError(res, 409, 'Ya existe un equipo con ese numero.')
      return
    }

    const { data: plaza, error: plazaError } = await adminSupabase
      .from('plazas')
      .select('id')
      .eq('id', plazaId)
      .eq('activa', true)
      .maybeSingle()

    if (plazaError) {
      jsonError(
        res,
        500,
        'No se pudo validar la plaza.',
        plazaError.message
      )
      return
    }

    if (!plaza) {
      jsonError(res, 400, 'La plaza seleccionada no existe o esta inactiva.')
      return
    }

    if (facturadorId) {
      const { data: facturador, error: facturadorError } = await adminSupabase
        .from('facturadores')
        .select('id')
        .eq('id', facturadorId)
        .eq('activo', true)
        .maybeSingle()

      if (facturadorError) {
        jsonError(
          res,
          500,
          'No se pudo validar el facturador.',
          facturadorError.message
        )
        return
      }

      if (!facturador) {
        jsonError(
          res,
          400,
          'El facturador seleccionado no existe o esta inactivo.'
        )
        return
      }
    }

    const rpcPayload = {
      p_equipo_id: teamId,
      p_numero: numero,
      p_nombre: nombre,
      p_plaza_id: plazaId,
      p_lider_id: liderId,
      p_activo: activo,
      p_inicio: new Date().toISOString(),
      p_motivo: 'Edicion administrativa de equipo',
    }

    /*
     * Si facturador_id viene en la solicitud:
     *   UUID  -> asignar/reemplazar facturador.
     *   null/'' -> quitar facturador.
     *
     * El frontend de edición enviará siempre este campo.
     */
    if (facturadorId !== undefined) {
      rpcPayload.p_facturador_id = facturadorId
    }

    const { error } = await adminSupabase.rpc(
      'actualizar_equipo_organizacion',
      rpcPayload
    )

    if (error) {
      if (isMissingOrganizationSchema(error)) {
        jsonError(
          res,
          409,
          'La gestion de equipos estara disponible cuando se habilite el modelo organizacional.'
        )
        return
      }

      jsonError(
        res,
        ['23P01', '23505', '23503', 'P0001'].includes(error.code) ? 409 : 500,
        'No se pudo actualizar el equipo.',
        error.message
      )
      return
    }

    res.json({
      ok: true,
      team: {
        id: teamId,
        numero,
        nombre,
        plaza_id: plazaId,
        facturador_id: facturadorId === undefined ? null : facturadorId,
        lider_actual_id: activo ? liderId : null,
        activo,
      },
    })
  }))