html = open('C:/Users/c830627/Desktop/reyi-restock/main_template.html', encoding='utf-8').read()
open('C:/Users/c830627/Desktop/reyi-restock/main.html', 'w', encoding='utf-8').write(html)
print('done', len(html))
