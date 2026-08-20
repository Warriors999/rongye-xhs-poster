from pathlib import Path
import os

from playwright.sync_api import sync_playwright


IMAGE_PATH = Path(os.environ.get('LOCAL_AI_IMAGE', 'test-results/iphone-13-final.png'))
SCREENSHOT_PATH = Path('test-results/real-ai-mobile.png')


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path='/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        )
        page = browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        port = os.environ.get('LOCAL_AI_PORT', '3000')
        page.goto(f'http://127.0.0.1:{port}', wait_until='networkidle')
        print('title:', page.title())
        print('buttons:', page.locator('button').all_text_contents())
        if os.environ.get('LOCAL_AI_FULL') != '1':
            print('inputs:', page.locator('input').count(), 'textareas:', page.locator('textarea').count())
            page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
            print('screenshot:', SCREENSHOT_PATH)
            browser.close()
            return

        if not IMAGE_PATH.exists():
            raise FileNotFoundError(IMAGE_PATH)
        page.get_by_role('button', name='进入绒页').click()
        page.get_by_role('heading', name='把玩偶照片，变成小红书海报。').wait_for()
        page.get_by_label('从相册选择照片').set_input_files(str(IMAGE_PATH))
        page.get_by_role('textbox', name='我的创作想法').fill('复古玩具店橱窗，暖黄色灯光，带一点童话感')
        page.get_by_role('button', name='生成 3 张海报').click()
        page.get_by_role('heading', name='选一张，直接保存').wait_for(timeout=300_000)
        poster_count = page.get_by_role('button', name='保存这张').count()
        if poster_count != 3:
            raise AssertionError(f'expected 3 save buttons, got {poster_count}')
        page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
        print('real AI mobile flow passed: 3 poster choices rendered')
        print('screenshot:', SCREENSHOT_PATH)
        browser.close()


if __name__ == '__main__':
    main()
