# PHP shared-hosting style image (Apache + PHP).
# Build context: repository root.
# Prefer `jasefly build --runtime=php --target=shared` for classic ZIP hosting.
FROM php:8.3-apache

RUN docker-php-ext-install pdo pdo_mysql \
  && a2enmod rewrite headers

# Expect hosting package laid out under /var/www/html (public_html contents)
COPY release/hosting-package/public_html/ /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80
