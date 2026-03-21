from PIL import Image
img = Image.open('/Users/jarnosaarinen/subsoccer/goalie_sprite.png')
print(img.size)
# print color of center of each quadrant
w, h = img.size
q1 = img.getpixel((w//4, h//4))
q2 = img.getpixel((w*3//4, h//4))
q3 = img.getpixel((w//4, h*3//4))
q4 = img.getpixel((w*3//4, h*3//4))
print(q1, q2, q3, q4)
