"""Crea (o actualiza) las cuentas de las tres personas que usan el sistema.

    python scripts/crear_usuarios.py

No hay registro publico: las cuentas las crea el administrador y punto. Se
entra escribiendo "claudia", no un mail; el mail interno existe solo porque
Supabase Auth lo pide y nunca recibe correo.

Cada cuenta se queda con SU PROPIA clave, nunca una compartida entre las tres:
sale de CLAVE_DEV_<USUARIO> en .env.local (por ejemplo CLAVE_DEV_CLAUDIA) o,
si no esta, se genera una al azar y se imprime una sola vez. Para cambiarle la
clave a alguien puntual, se pone su CLAVE_DEV_<USUARIO> en .env.local y se
corre esto de nuevo.
"""

import secrets

import psycopg

from migrar import leer_env, url_conexion

DOMINIO = "barba.local"

# El rol es el texto que se ve abajo del nombre en el menu: es una etiqueta,
# no un permiso. El permiso es la ultima columna, `es_admin`, que decide quien
# ve el panel con la facturacion (migracion 0006). Federico pidio que lo vea
# solo el; las dos empleadas entran a la pantalla operativa.
PERSONAS = [
    ("federico", "Federico Barba", "Dueño y ventas", True),
    ("claudia", "Claudia", "Ventas e ingresos", False),
    ("roxana", "Roxana", "Entregas", False),
]


def main() -> None:
    env = leer_env()
    claves: dict[str, str] = {}

    with psycopg.connect(url_conexion(env), connect_timeout=20) as con:
        for usuario, nombre, rol, es_admin in PERSONAS:
            clave = (
                env.get(f"CLAVE_DEV_{usuario.upper()}") or secrets.token_urlsafe(12)
            )
            claves[usuario] = clave
            email = f"{usuario}@{DOMINIO}"

            existente = con.execute(
                "select id from auth.users where email = %s", (email,)
            ).fetchone()

            if existente:
                uid = existente[0]
                con.execute(
                    """update auth.users
                          set encrypted_password = crypt(%s, gen_salt('bf', 10)),
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
                           crypt(%s, gen_salt('bf', 10)), now(), now(), now(),
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
                """insert into perfiles (id, nombre, rol, es_admin)
                   values (%s, %s, %s, %s)
                   on conflict (id) do update
                     set nombre = excluded.nombre,
                         rol = excluded.rol,
                         es_admin = excluded.es_admin""",
                (uid, nombre, rol, es_admin),
            )
            print(f"  {usuario:10s} {accion}")

        con.commit()

    print("\nEntran con su nombre y su propia clave:")
    for usuario, clave in claves.items():
        print(f"  {usuario:10s} {clave}")


if __name__ == "__main__":
    main()
