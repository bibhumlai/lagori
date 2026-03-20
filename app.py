from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components


ROOT = Path(__file__).parent


def load_text(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


st.set_page_config(page_title="Lagori Game", page_icon="🎯", layout="wide")

st.title("Lagori: Seven Stones")
st.caption("Streamlit wrapper for the browser game.")

st.markdown(
    """
Play tips:
- Choose a level in the game UI.
- Higher levels increase speed and add obstacles.
- Refresh the page if you update the game assets.
"""
)

html_body = load_text("index.html")
css = load_text("styles.css")
js = load_text("script.js")

# Inline local assets so the game can run inside a single Streamlit component.
html_body = html_body.replace('<link rel="stylesheet" href="./styles.css">', f"<style>{css}</style>")
html_body = html_body.replace('<script src="./script.js"></script>', f"<script>{js}</script>")

components.html(html_body, height=2100, scrolling=True)
