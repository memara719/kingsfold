"""Isotopia: build the city of tomorrow, 1955. Run with:  python main.py
The same file runs in the browser through pygbag (it needs the async loop below)."""

import asyncio
import sys

import pygame


async def main():
    pygame.init()
    pygame.display.set_caption('Isotopia')
    flags = 0 if sys.platform == 'emscripten' else pygame.RESIZABLE
    window = pygame.display.set_mode((1200, 720), flags)
    from app import App
    app = App()
    clock = pygame.time.Clock()
    while True:
        for e in pygame.event.get():
            if e.type == pygame.QUIT:
                pygame.quit()
                return
            app.handle(e)
        app.update(pygame.time.get_ticks())
        app.draw()
        app.present(window)
        pygame.display.flip()
        clock.tick(30)
        await asyncio.sleep(0)


asyncio.run(main())
