import asyncio, pathlib
from playwright.async_api import async_playwright

async def main():
    here = pathlib.Path(__file__).parent.resolve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1000, "height": 1000}, device_scale_factor=1)
        await pg.goto((here / "logo.html").as_uri())
        await pg.evaluate("window.ready")
        await pg.screenshot(path=str(here / "hisab-logo.png"), omit_background=True)
        await b.close()

asyncio.run(main())
