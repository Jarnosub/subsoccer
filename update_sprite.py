from PIL import Image

def make_transparent():
    # Load the generated sprite sheet
    img = Image.open('/Users/jarnosaarinen/.gemini/antigravity/brain/6eb3dca9-3cac-4cf4-b302-d04c62c8b78a/goalie_sprite_1773517151708.png')
    img = img.convert("RGBA")
    datas = img.getdata()
    
    newData = []
    for item in datas:
        # Check against the magenta background
        if item[0] > 200 and item[1] < 50 and item[2] > 200:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    img.save('/Users/jarnosaarinen/subsoccer/goalie_sprite.png', "PNG")

make_transparent()
