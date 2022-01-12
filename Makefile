test:
	NODE_OPTIONS=--experimental-vm-modules node --inspect ./node_modules/.bin/jest -i # __tests__/validator.test.js

.PHONY: test