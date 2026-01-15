import os
import re
import io

dir_path = r'e:\Research Hub\Edu Meeting Free Website Template - Free-CSS.com\Website\modules\design-gen\pages'

updated_files = []

for filename in os.listdir(dir_path):
    if filename.endswith('.html'):
        filepath = os.path.join(dir_path, filename)
        try:
            with io.open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            
            # Fix user-auth.js path: replace ../../assets/js/user-auth.js with ../../../assets/js/user-auth.js
            # Use regex to catch variations if any
            content = re.sub(r'src=["\']\.\./\.\./assets/js/user-auth\.js["\']', 'src="../../../assets/js/user-auth.js"', content)
            
            # Also check for other assets that might be wrong
            # In crd.html, custom.js was already ../../../
            # Let's ensure any ../../assets/ is fixed to ../../../assets/ if it's in this deep directory
            # but ONLY if it's supposed to point to root assets.
            # Usually, modules/design-gen/pages/ should always use ../../../ for root assets.
            
            if content != original_content:
                with io.open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                updated_files.append(filename)
                
        except Exception as e:
            print("Error processing " + filename + ": " + str(e))

print("Fixed user-auth script paths in count: " + str(len(updated_files)))
print("Files: " + ", ".join(updated_files))
