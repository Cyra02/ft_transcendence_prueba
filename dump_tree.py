#!/usr/bin/env python3
"""
dump_tree.py
Recorre todos los archivos de un directorio (como un tree) y vuelca
el contenido de cada uno en un único fichero .txt de salida.

Uso:
    python dump_tree.py [directorio] [opciones]

Opciones:
    --output   -o   Fichero de salida  (por defecto: dump_output.txt)
    --exclude  -e   Patrones a excluir (se puede repetir)
                    Ej: -e "*.pyc" -e "__pycache__" -e ".git"
    --max-size -s   Tamaño máximo de archivo en KB (por defecto: 500)
    --encoding      Encoding de lectura de archivos (por defecto: utf-8)
    --no-binary     Omitir archivos binarios (activado por defecto)

Ejemplos:
    python dump_tree.py .
    python dump_tree.py /mi/proyecto -o resultado.txt -e "*.pyc" -e ".git"
    python dump_tree.py . --max-size 200
"""

import os
import sys
import argparse
import fnmatch
import datetime


# ── Extensiones que se consideran binarias ────────────────────────────────────
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv", ".flac",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".obj",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".pyc", ".pyo", ".class",
    ".db", ".sqlite", ".sqlite3",
    ".ttf", ".otf", ".woff", ".woff2",
}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Vuelca el árbol de archivos y su contenido en un .txt"
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Directorio raíz a recorrer (por defecto: directorio actual)",
    )
    parser.add_argument("-o", "--output", default="dump_output.txt",
                        help="Fichero de salida")
    parser.add_argument("-e", "--exclude", action="append", default=[],
                        metavar="PATRÓN",
                        help="Patrón glob a excluir (repetible)")
    parser.add_argument("-s", "--max-size", type=int, default=500,
                        metavar="KB",
                        help="Tamaño máximo de archivo en KB (0 = sin límite)")
    parser.add_argument("--encoding", default="utf-8",
                        help="Encoding para leer los archivos")
    parser.add_argument("--no-binary", action="store_true", default=True,
                        help="Omitir archivos binarios (por defecto activo)")
    return parser.parse_args()


def is_excluded(path, patterns):
    """Devuelve True si algún segmento del path coincide con algún patrón."""
    parts = path.replace("\\", "/").split("/")
    for part in parts:
        for pattern in patterns:
            if fnmatch.fnmatch(part, pattern):
                return True
    return False


def is_binary(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext in BINARY_EXTENSIONS:
        return True
    # Comprobación extra leyendo los primeros bytes
    try:
        with open(filepath, "rb") as f:
            chunk = f.read(1024)
        return b"\x00" in chunk
    except OSError:
        return True


def build_tree(root, exclude_patterns):
    """
    Genera una lista de tuplas (indent_str, name, full_path, is_dir)
    representando el árbol de directorios.
    """
    tree_lines = []

    def _walk(current_dir, prefix=""):
        try:
            entries = sorted(os.scandir(current_dir), key=lambda e: (e.is_file(), e.name))
        except PermissionError:
            return

        entries = [
            e for e in entries
            if not is_excluded(
                os.path.relpath(e.path, root).replace("\\", "/"),
                exclude_patterns
            )
        ]

        for i, entry in enumerate(entries):
            is_last = i == len(entries) - 1
            connector = "└── " if is_last else "├── "
            tree_lines.append((prefix + connector, entry.name, entry.path, entry.is_dir()))
            if entry.is_dir():
                extension = "    " if is_last else "│   "
                _walk(entry.path, prefix + extension)

    tree_lines.append(("", os.path.basename(os.path.abspath(root)) + "/", root, True))
    _walk(root)
    return tree_lines


def read_file(filepath, encoding, max_size_kb):
    """Lee el contenido de un archivo y devuelve (contenido, nota)."""
    # Comprobación de tamaño
    if max_size_kb > 0:
        size_kb = os.path.getsize(filepath) / 1024
        if size_kb > max_size_kb:
            return None, f"[OMITIDO: tamaño {size_kb:.1f} KB > límite {max_size_kb} KB]"

    try:
        with open(filepath, "r", encoding=encoding, errors="replace") as f:
            return f.read(), None
    except Exception as e:
        return None, f"[ERROR al leer: {e}]"


def dump(args):
    root = os.path.abspath(args.directory)
    if not os.path.isdir(root):
        print(f"Error: '{root}' no es un directorio válido.", file=sys.stderr)
        sys.exit(1)

    # Añadir el propio archivo de salida a los excluidos para no incluirlo
    output_abs = os.path.abspath(args.output)
    exclude_patterns = args.exclude + [os.path.basename(output_abs)]

    tree = build_tree(root, exclude_patterns)

    stats = {"total": 0, "leidos": 0, "omitidos": 0, "errores": 0}

    with open(output_abs, "w", encoding="utf-8") as out:
        # ── Cabecera ──────────────────────────────────────────────────────────
        out.write("=" * 70 + "\n")
        out.write("  DUMP DE ÁRBOL DE ARCHIVOS\n")
        out.write(f"  Generado: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        out.write(f"  Directorio raíz: {root}\n")
        out.write("=" * 70 + "\n\n")

        # ── Árbol visual ──────────────────────────────────────────────────────
        out.write("ESTRUCTURA DE DIRECTORIOS\n")
        out.write("-" * 70 + "\n")
        for prefix, name, _, is_dir in tree:
            label = name if is_dir else name
            out.write(prefix + label + "\n")
        out.write("\n")

        # ── Contenido de archivos ─────────────────────────────────────────────
        out.write("=" * 70 + "\n")
        out.write("CONTENIDO DE ARCHIVOS\n")
        out.write("=" * 70 + "\n\n")

        for _, name, full_path, is_dir in tree:
            if is_dir:
                continue

            stats["total"] += 1
            rel_path = os.path.relpath(full_path, root)

            # Separador de archivo
            out.write("┌" + "─" * 68 + "┐\n")
            out.write(f"│  ARCHIVO: {rel_path}\n")
            out.write("└" + "─" * 68 + "┘\n")

            # ¿Binario?
            if args.no_binary and is_binary(full_path):
                out.write("[OMITIDO: archivo binario]\n\n")
                stats["omitidos"] += 1
                continue

            content, note = read_file(full_path, args.encoding, args.max_size)

            if note:
                out.write(note + "\n\n")
                stats["errores"] += 1
            else:
                out.write(content)
                if content and not content.endswith("\n"):
                    out.write("\n")
                out.write("\n")
                stats["leidos"] += 1

            print(f"  ✓  {rel_path}")

        # ── Resumen final ─────────────────────────────────────────────────────
        out.write("=" * 70 + "\n")
        out.write("RESUMEN\n")
        out.write("-" * 70 + "\n")
        out.write(f"  Archivos totales  : {stats['total']}\n")
        out.write(f"  Leídos            : {stats['leidos']}\n")
        out.write(f"  Omitidos (binario): {stats['omitidos']}\n")
        out.write(f"  Con errores       : {stats['errores']}\n")
        out.write("=" * 70 + "\n")

    print(f"\n✅ Listo → {output_abs}")
    print(f"   {stats['leidos']} archivos volcados | "
          f"{stats['omitidos']} omitidos | "
          f"{stats['errores']} errores")


if __name__ == "__main__":
    dump(parse_args())