# Lagori Browser Game

Open [index.html](/D:/game/lagori-game/index.html) in a browser to play directly.

## Streamlit

This project also includes a Streamlit wrapper in [app.py](/D:/game/lagori-game/app.py).

Run it with:

```powershell
streamlit run app.py
```

If Streamlit is not installed yet:

```powershell
py -m pip install -r requirements.txt
```

## Static file option

If your browser blocks local script execution, run a tiny static server from this folder instead:

```powershell
py -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).
