node('general') {
    base = load '/var/jenkins_home/workspace/Infra/build-scripts/build/Jenkinsfile'
    creds = base.get_decrypt_creds() + base.get_app_creds('events-forwarder')
    base.build(creds, 'repo', base.get_npm_stages())
}