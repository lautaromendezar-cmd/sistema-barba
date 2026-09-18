"""¿Alcanza con tener una cuenta para ver los datos de Grupo Barba?

    python scripts/probar_intruso_con_cuenta.py

Es la prueba que más importa de todas. El registro público de Supabase se
apaga con una casilla del panel, y una casilla se puede volver a prender sola
cuando alguien toca algo, o venir prendida en un proyecto nuevo. Si la
seguridad dependiera de eso, cualquiera que se registrara con su propio mail
entraría a ver los remitos y los clientes de la empresa.

Este script crea un usuario de verdad SIN perfil de empleado, entra con él
por la misma API que usa el navegador, y verifica que no vea absolutamente
nada. Al terminar lo borra.
"""

import json
import sys
import urllib.error
import urllib.request

import psycopg

from migrar import leer_env, url_conexion

EMAIL = "colado@barba.local"
CLAVE = "colado-de-prueba-" + __import__("secrets").token_urlsafe(8)

fallos = 0


def chequear(descripcion: str, ok: bool, detalle: str = "") -> None:
    global fallos
    print(f"  {'OK   ' if ok else 'GRAVE'} {descripcion}" + ("" if ok else f" → {detalle}"))
    if not ok:
        fallos += 1


def pedir(url: str, token: str, anon: str):
    req = urllib.request.Request(url)
    req.add_header("apikey", anon)
    req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"[]")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:120]


def main() -> None:
    env = leer_env()
    base = env["NEXT_PUBLIC_SUPABASE_URL"]
    anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]

    with psycopg.connect(url_conexion(env), connect_timeout=20) as con:
        con.execute("delete from auth.users where email = %s", (EMAIL,))
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
                   '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
                   '', '', '', ''
               ) returning id""",
            (EMAIL, CLAVE),
        ).fetchone()[0]
        con.execute(
            """insert into auth.identities (
                   id, user_id, identity_data, provider, provider_id,
                   last_sign_in_at, created_at, updated_at
               ) values (gen_random_uuid(), %s, %s::jsonb, 'email', %s,
                         now(), now(), now())""",
            (uid, f'{{"sub":"{uid}","email":"{EMAIL}","email_verified":true}}', EMAIL),
        )
        con.commit()
        print(f"\nCuenta creada sin perfil de empleado: {EMAIL}")

    # Entra por la misma puerta que el navegador.
    datos = json.dumps({"email": EMAIL, "password": CLAVE}).encode()
    req = urllib.request.Request(f"{base}/auth/v1/token?grant_type=password", data=datos)
    req.add_header("apikey", anon)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        token = json.loads(r.read())["access_token"]
    print("Entró: tiene sesión válida y está 'autenticado'\n")

    for tabla in (
        "productos",
        "clientes",
        "cliente_direcciones",
        "perfiles",
        "remitos",
        "movimientos",
    ):
        estado, cuerpo = pedir(f"{base}/rest/v1/{tabla}?select=*", token, anon)
        vacio = isinstance(cuerpo, list) and len(cuerpo) == 0
        chequear(
            f"{tabla}: no ve nada",
            estado in (401, 403) or vacio,
            f"HTTP {estado}, devolvió {cuerpo if isinstance(cuerpo, str) else len(cuerpo)}",
        )

    for vista in ("stock_fisico", "stock_a_pedir"):
        estado, cuerpo = pedir(f"{base}/rest/v1/{vista}?select=*", token, anon)
        vacio = isinstance(cuerpo, list) and len(cuerpo) == 0
        chequear(
            f"{vista}: no ve el stock",
            estado in (401, 403) or vacio,
            f"HTTP {estado}, devolvió {cuerpo if isinstance(cuerpo, str) else len(cuerpo)}",
        )

    with psycopg.connect(url_conexion(env), connect_timeout=20) as con:
        con.execute("delete from auth.users where email = %s", (EMAIL,))
        con.commit()
    print("\nCuenta borrada.")

    if fallos:
        print(f"\n{fallos} filtración(es): tener cuenta alcanza para ver datos.")
        sys.exit(1)
    print("\nTener una cuenta no alcanza: sin perfil de empleado no se ve nada.")


if __name__ == "__main__":
    main()
