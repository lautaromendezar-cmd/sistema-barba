"""Crea (o actualiza) las cuentas de las tres personas que usan el sistema.

    python scripts/crear_usuarios.py

No hay registro publico: las cuentas las crea el administrador y punto. Se
entra escribiendo "claudia", no un mail; el mail interno existe solo porque
Supabase Auth lo pide y nunca recibe correo.

Para cambiarle la clave a alguien, se corre esto de nuevo con la clave nueva.
"""

import sys

import psycopg

from migrar import leer_env, url_conexion

DOMINIO = "barba.local"

# Clave de arranque. Cada uno la cambia despues; para eso esta este script.
CLAVE_INICIAL = "barba2026"

# El rol es el texto que se ve arriba a la derecha. Los tres ven todo: no es
# un permiso, es saber quien esta usando el sistema.
PERSONAS = [
    ("federico", "Federico Barba", "Dueño y ventas"),
    ("claudia", "Claudia", "Ventas e ingresos"),
    ("roxana", "Roxana", "Entregas"),
]


def main() -> None:
    clave = sys.argv[1] if len(sys.argv) > 1 else CLAVE_INICIAL

    with psycopg.connect(url_conexion(leer_env()), connect_timeout=20) as con:
        for usuario, nombre, rol in PERSONAS:
            email = f"{usuario}@{DOMINIO}"

            existente = con.execute(
                "select id from auth.users where email = %s", (email,)
            ).fetchone()

            if existente:
                uid = existente[0]
                con.execute(
                    """update auth.users
                          set encrypted_password = crypt(%s, gen_salt('bf')),
                              updated_at = now()
                        where id = %s""",
                    (clave, uid),
                )
                accion = "actualizado"
            else:
                # Los cuatro campos de token van en cadena vacia y NO en NULL:
                # Supabase Auth los lee como texto y un NULL hace fallar el
                # login con "Database error querying schema", que no dice nada
                # sobre la causa real. Perdi un rato con eso.
                uid = con.execute(
                    """insert into auth.users (
                           instance_id, id, aud, role, email, encrypted_password,
                           email_confirmed_at, created_at, updated_at,
                           raw_app_meta_data, raw_user_meta_data,
                           confirmation_token, recovery_token,
                           email_change_token_new, email_change
                       ) values (
                           '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                           'authenticated', 'authenticated', %s,
                           crypt(%s, gen_salt('bf')), now(), now(), now(),
                           '{"provider":"email","providers":["email"]}'::jsonb,
                           %s::jsonb,
                           '', '', '', ''
                       ) returning id""",
                    (email, clave, f'{{"nombre":"{nombre}"}}'),
                ).fetchone()[0]

                # Sin la identidad, el login por email no encuentra al usuario.
                con.execute(
                    """insert into auth.identities (
                           id, user_id, identity_data, provider, provider_id,
                           last_sign_in_at, created_at, updated_at
                       ) values (
                           gen_random_uuid(), %s, %s::jsonb, 'email', %s,
                           now(), now(), now()
                       )""",
                    (
                        uid,
                        f'{{"sub":"{uid}","email":"{email}","email_verified":true}}',
                        email,
                    ),
                )
                accion = "creado"

            con.execute(
                """insert into perfiles (id, nombre, rol)
                   values (%s, %s, %s)
                   on conflict (id) do update
                     set nombre = excluded.nombre, rol = excluded.rol""",
                (uid, nombre, rol),
            )
            print(f"  {usuario:10s} {accion}")

        con.commit()

    print(f"\nEntran con su nombre y la clave: {clave}")


if __name__ == "__main__":
    main()
