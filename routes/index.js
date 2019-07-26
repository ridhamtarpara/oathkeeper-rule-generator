const zipdir = require('zip-dir');
const request = require('request');
const fs = require('fs');
const express = require('express');
const { EasyPromiseAll } = require('easy-promise-all');

const router = express.Router();
const debug = require('debug')('oathkeeper-rule-generator:server');

const fetchRules = (url => new Promise((resolve, reject) => {
  const options = {
    method: 'GET',
    url,
  };

  request(options, (error, response, body) => {
    if (error) reject(error);
    resolve(body);
  });
}));

/* GET home page. */
router.post('/generate', async (req, res) => {
  const rParams = req.body;
  debug('Body: ', req.body);
  const PromiseMap = {};
  rParams.envs.forEach((env) => {
    PromiseMap[env] = fetchRules(`${rParams.isRulesURLSecure ? 'https' : 'http'}://${env ? `${env}-` : ''}${rParams.rulesURL}/rules`);
  });
  EasyPromiseAll(PromiseMap).then((rules) => {
    const methods = rParams.allowAllMethods ? ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] : rParams.methods;
    rParams.envs.forEach((env) => {
      const rule = {
        id: `${rParams.serviceName}-${rParams.additionalTitle}`,
        description: rParams.description,
        match: {
          methods,
          url: `${rParams.isProxyURLSecure ? 'https' : 'http'}://${env ? `${env}-` : ''}${rParams.proxyURL}/${rParams.apiRoute}/<.*>`,
        },
        upstream: {
          preserve_host: true,
          strip_path: rParams.apiRoute,
          url: `${rParams.isServiceSecure ? 'https' : 'http'}://${env ? `${env}-` : ''}${rParams.serviceURL}`,
        },
        // not configured for now as keto don't have RBAC
        authorizer: {
          handler: 'allow',
          config: null,
        },
      };
      if (rParams.isPublic) {
        rule.authenticators = [{
          handler: 'noop',
          config: {},
        }];
      } else {
        rule.authenticators = [{
          handler: 'oauth2_introspection',
          config: {},
        }];
      }
      // only header mutator supported
      if (!rParams.mutator.addUser && !rParams.mutator.extraFields.length) {
        rule.mutator = {
          handler: 'noop',
          config: {},
        };
      } else {
        const mutator = {
          handler: 'header',
          config: {
            headers: {

            },
          },
        };
        if (rParams.mutator.addUser) {
          mutator.config.headers[`${rParams.mutator.headerPrefix}-user`] = '{{ print .Subject }}';
        }
        if (rParams.mutator.extraFields.length) {
          rParams.mutator.extraFields.forEach((header) => {
            mutator.config.headers[`${rParams.mutator.headerPrefix}-${header}`] = `{{ print .Extra.${header} }}`;
          });
        }
        rule.mutator = mutator;
      }
      const envRules = JSON.parse(rules[env]);
      envRules.push(rule);
      fs.writeFileSync(`rules/${env || 'prod'}.json`, `${JSON.stringify(envRules)}`, (e) => {
        if (e) {
          console.error('masterdata write failed');
        } else {
          console.info('master data has been updated');
        }
      });
    });
    zipdir('rules', { saveTo: 'rules/rules.zip' }, (err, buffer) => {
      res.download('rules/rules.zip');
    });
    // fstream.Reader({ path: 'rules', type: 'Directory' }) /* Read the source directory */
    // .pipe(tar.Pack()); /* Convert the directory to a .tar file */
    // .pipe(zlib.gzip()) /* Compress the .tar file */
    // .pipe(fstream.Writer({ path: 'rules/rules.tar.gz' })); /* Give the output file name */
  });
});

module.exports = router;
