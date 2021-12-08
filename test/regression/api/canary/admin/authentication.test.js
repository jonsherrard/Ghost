const chai = require('chai');
const {expect} = require('chai');
const {any} = require('expect');
const chaiJestSnapshot = require('@ethanresnick/chai-jest-snapshot');

const should = require('should');
const sinon = require('sinon');
const testUtils = require('../../../../utils/index');
const framework = require('../../../../utils/e2e-framework');
const models = require('../../../../../core/server/models/index');
const security = require('@tryghost/security');
const settingsCache = require('../../../../../core/shared/settings-cache');
const config = require('../../../../../core/shared/config/index');
const mailService = require('../../../../../core/server/services/mail/index');

let request;

describe.only('Authentication API canary', function () {
    describe('Blog setup', function () {
        before(async function () {
            chaiJestSnapshot.resetSnapshotRegistry();
            request = await framework.getAgent('/ghost/api/canary/admin/');
        });

        after(async function () {
            await framework.resetDb();
        });

        beforeEach(function () {
            chaiJestSnapshot.configureUsingMochaContext(this);
            sinon.stub(mailService.GhostMailer.prototype, 'send').resolves('Mail is disabled');
        });

        afterEach(function () {
            sinon.restore();
        });

        it('is setup? no', function () {
            return request
                .get('authentication/setup')
                .set('Origin', config.get('url'))
                .expect(200)
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });
                });
        });

        it('complete setup', function () {
            return request
                .post('authentication/setup')
                .set('Origin', config.get('url'))
                .send({
                    setup: [{
                        name: 'test user',
                        email: 'test@example.com',
                        password: 'thisissupersafe',
                        blogTitle: 'a test blog'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(201)
                .then((res) => {
                    expect(res.body).to.matchSnapshot({
                        users: [{
                            created_at: any(Date),
                            updated_at: any(Date)
                        }]
                    });
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });

                    mailService.GhostMailer.prototype.send.called.should.be.true();
                    mailService.GhostMailer.prototype.send.args[0][0].to.should.equal('test@example.com');
                });
        });

        it('is setup? yes', function () {
            return request
                .get('authentication/setup')
                .set('Origin', config.get('url'))
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });
                });
        });

        it('complete setup again', function () {
            return request
                .post('authentication/setup')
                .set('Origin', config.get('url'))
                .send({
                    setup: [{
                        name: 'test user',
                        email: 'test-leo@example.com',
                        password: 'thisissupersafe',
                        blogTitle: 'a test blog'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(403);
        });

        it('update setup', async function () {
            await framework.initFixtures();
            await request.loginAsOwner();

            const res = await request
                .put('authentication/setup')
                .set('Origin', config.get('url'))
                .send({
                    setup: [{
                        name: 'test user edit',
                        email: 'test-edit@example.com',
                        password: 'thisissupersafe',
                        blogTitle: 'a test blog'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(200);

            expect(res.body).to.matchSnapshot({
                users: [{
                    created_at: any(String),
                    last_seen: any(String),
                    updated_at: any(String)
                }]
            });
            expect(res.headers).to.matchSnapshot({
                date: any(String),
                etag: any(String)
            });
        });
    });

    describe('Invitation', function () {
        before(async function () {
            request = await framework.getAgent('/ghost/api/canary/admin/');
            // NOTE: this order of fixture initialization boggles me. Ideally should not depend on agent/login sequence
            await framework.initFixtures('invites');
            await request.loginAsOwner();
        });

        after(async function () {
            await framework.resetDb();
        });

        it('check invite with invalid email', function () {
            return request
                .get('authentication/invitation?email=invalidemail')
                .set('Origin', config.get('url'))
                .expect('Content-Type', /json/)
                .expect(400);
        });

        it('check valid invite', function () {
            return request
                .get(`authentication/invitation?email=${testUtils.DataGenerator.forKnex.invites[0].email}`)
                .set('Origin', config.get('url'))
                .expect('Content-Type', /json/)
                .expect(200)
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                });
        });

        it('check invalid invite', function () {
            return request
                .get(`authentication/invitation?email=notinvited@example.org`)
                .set('Origin', config.get('url'))
                .expect('Content-Type', /json/)
                .expect(200)
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                });
        });

        it('try to accept without invite', function () {
            return request
                .post('authentication/invitation')
                .set('Origin', config.get('url'))
                .send({
                    invitation: [{
                        token: 'lul11111',
                        password: 'lel123456',
                        email: 'not-invited@example.org',
                        name: 'not invited'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(404);
        });

        it('try to accept with invite and existing email address', function () {
            return request
                .post('authentication/invitation')
                .set('Origin', config.get('url'))
                .send({
                    invitation: [{
                        token: testUtils.DataGenerator.forKnex.invites[0].token,
                        password: '12345678910',
                        email: testUtils.DataGenerator.forKnex.users[0].email,
                        name: 'invited'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(422);
        });

        it('try to accept with invite', function () {
            return request
                .post('authentication/invitation')
                .set('Origin', config.get('url'))
                .send({
                    invitation: [{
                        token: testUtils.DataGenerator.forKnex.invites[0].token,
                        password: '12345678910',
                        email: testUtils.DataGenerator.forKnex.invites[0].email,
                        name: 'invited'
                    }]
                })
                .expect('Content-Type', /json/)
                .expect(200)
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                });
        });
    });

    describe('Password reset', function () {
        const user = testUtils.DataGenerator.forModel.users[0];

        before(async function () {
            request = await framework.getAgent('/ghost/api/canary/admin/');
            // NOTE: this order of fixture initialization boggles me. Ideally should not depend on agent/login sequence
            await framework.initFixtures('invites');
            await request.loginAsOwner();
        });

        after(async function () {
            await framework.resetDb();
        });

        beforeEach(function () {
            sinon.stub(mailService.GhostMailer.prototype, 'send').resolves('Mail is disabled');
        });

        afterEach(function () {
            sinon.restore();
        });

        it('reset password', function (done) {
            models.User.getOwnerUser(testUtils.context.internal)
                .then(function (ownerUser) {
                    const token = security.tokens.resetToken.generateHash({
                        expires: Date.now() + (1000 * 60),
                        email: user.email,
                        dbHash: settingsCache.get('db_hash'),
                        password: ownerUser.get('password')
                    });

                    request.put('authentication/passwordreset')
                        .set('Origin', config.get('url'))
                        .set('Accept', 'application/json')
                        .send({
                            passwordreset: [{
                                token: token,
                                newPassword: 'thisissupersafe',
                                ne2Password: 'thisissupersafe'
                            }]
                        })
                        .expect(200)
                        .end(function (err, res) {
                            if (err) {
                                return done(err);
                            }

                            expect(res.body).to.matchSnapshot();
                            expect(res.headers).to.matchSnapshot({
                                date: any(String),
                                etag: any(String)
                            });
                            done();
                        });
                })
                .catch(done);
        });

        it('reset password: invalid token', function () {
            return request
                .put('authentication/passwordreset')
                .set('Origin', config.get('url'))
                .set('Accept', 'application/json')
                .send({
                    passwordreset: [{
                        token: 'invalid',
                        newPassword: 'thisissupersafe',
                        ne2Password: 'thisissupersafe'
                    }]
                })
                .expect(401)
                .then((res) => {
                    expect(res.body).to.matchSnapshot({
                        errors: [{
                            id: any(String)
                        }]
                    });
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });
                });
        });

        it('reset password: expired token', function () {
            return models.User.getOwnerUser(testUtils.context.internal)
                .then(function (ownerUser) {
                    const dateInThePast = Date.now() - (1000 * 60);
                    const token = security.tokens.resetToken.generateHash({
                        expires: dateInThePast,
                        email: user.email,
                        dbHash: settingsCache.get('db_hash'),
                        password: ownerUser.get('password')
                    });

                    return request
                        .put('authentication/passwordreset')
                        .set('Origin', config.get('url'))
                        .set('Accept', 'application/json')
                        .send({
                            passwordreset: [{
                                token: token,
                                newPassword: 'thisissupersafe',
                                ne2Password: 'thisissupersafe'
                            }]
                        })
                        .expect(400)
                        .then((res) => {
                            expect(res.body).to.matchSnapshot({
                                errors: [{
                                    id: any(String)
                                }]
                            });
                            expect(res.headers).to.matchSnapshot({
                                date: any(String),
                                etag: any(String)
                            });
                        });
                });
        });

        it('reset password: unmatched token', function () {
            const token = security.tokens.resetToken.generateHash({
                expires: Date.now() + (1000 * 60),
                email: user.email,
                dbHash: settingsCache.get('db_hash'),
                password: 'invalid_password'
            });

            return request
                .put('authentication/passwordreset')
                .set('Origin', config.get('url'))
                .set('Accept', 'application/json')
                .send({
                    passwordreset: [{
                        token: token,
                        newPassword: 'thisissupersafe',
                        ne2Password: 'thisissupersafe'
                    }]
                })
                .expect(400)
                .then((res) => {
                    expect(res.body).to.matchSnapshot({
                        errors: [{
                            id: any(String)
                        }]
                    });
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });
                });
        });

        it('reset password: generate reset token', function () {
            return request
                .post('authentication/passwordreset')
                .set('Origin', config.get('url'))
                .set('Accept', 'application/json')
                .send({
                    passwordreset: [{
                        email: user.email
                    }]
                })
                .expect(200)
                .then((res) => {
                    expect(res.body).to.matchSnapshot();
                    expect(res.headers).to.matchSnapshot({
                        date: any(String),
                        etag: any(String)
                    });
                });
        });
    });

    describe('Reset all passwords', function () {
        let sendEmail;
        before(async function () {
            request = await framework.getAgent('/ghost/api/canary/admin/');
            // NOTE: this order of fixture initialization boggles me. Ideally should not depend on agent/login sequence
            await framework.initFixtures('invites');
            await request.loginAsOwner();
        });

        after(async function () {
            await framework.resetDb();
        });

        beforeEach(function () {
            sendEmail = sinon.stub(mailService.GhostMailer.prototype, 'send').resolves('Mail is disabled');
        });

        afterEach(function () {
            sinon.restore();
        });

        it('reset all passwords returns 200', function (done) {
            request.post('authentication/reset_all_passwords')
                .set('Origin', config.get('url'))
                .set('Accept', 'application/json')
                .send({})
                .expect(200)
                .end(async function (err, res) {
                    if (err) {
                        return done(err);
                    }
                    try {
                        expect(res.body).to.matchSnapshot();
                        expect(res.headers).to.matchSnapshot({
                            date: any(String),
                            etag: any(String)
                        });

                        // All users locked
                        const users = await models.User.fetchAll();
                        for (const user of users) {
                            user.get('status').should.be.eql('locked');
                        }

                        // No session left
                        const sessions = await models.Session.fetchAll();
                        sessions.length.should.be.eql(0);

                        sendEmail.callCount.should.be.eql(2);
                        sendEmail.firstCall.args[0].subject.should.be.eql('Reset Password');
                        sendEmail.secondCall.args[0].subject.should.be.eql('Reset Password');

                        done();
                    } catch (error) {
                        done(error);
                    }
                });
        });
    });
});
